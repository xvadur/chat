import { spawn } from "node:child_process";
const DEFAULT_MAX_BUFFERED_MESSAGES = 256;
const truncate = (text, limit) => text.length <= limit ? text : `${text.slice(0, limit)}...`;
export class AcpProcessBridge {
    name;
    command;
    args;
    logger;
    retry;
    onMessage;
    onReady;
    onClose;
    maxBufferedMessages;
    spawnFn;
    child = null;
    ready = false;
    closing = false;
    backoffMs;
    attempts = 0;
    reconnectTimer = null;
    stdoutBuffer = "";
    stderrBuffer = "";
    writeQueue = [];
    waitingDrain = false;
    constructor(options) {
        this.name = options.name;
        this.command = options.command;
        this.args = options.args;
        this.logger = options.logger;
        this.retry = options.retry;
        this.onMessage = options.onMessage;
        this.onReady = options.onReady;
        this.onClose = options.onClose;
        this.maxBufferedMessages = options.maxBufferedMessages ?? DEFAULT_MAX_BUFFERED_MESSAGES;
        this.spawnFn = options.spawnFn ?? spawn;
        this.backoffMs = options.retry.baseMs;
    }
    start() {
        this.closing = false;
        this.connect();
    }
    stop() {
        this.closing = true;
        this.ready = false;
        this.stdoutBuffer = "";
        this.stderrBuffer = "";
        this.writeQueue = [];
        this.waitingDrain = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (!this.child) {
            return;
        }
        const child = this.child;
        this.child = null;
        try {
            child.kill("SIGTERM");
        }
        catch {
            // ignore kill error
        }
    }
    isReady() {
        return this.ready;
    }
    send(message) {
        let line = "";
        try {
            line = `${JSON.stringify(message)}\n`;
        }
        catch (err) {
            this.logger.warn(`[${this.name}] failed to serialize ACP message: ${String(err)}`);
            return false;
        }
        if (!this.ready || !this.child || this.child.stdin.destroyed) {
            this.enqueue(line);
            return true;
        }
        if (this.writeDirect(line)) {
            return true;
        }
        this.enqueue(line);
        return true;
    }
    connect() {
        if (this.closing) {
            return;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        let child;
        try {
            child = this.spawnFn(this.command, this.args, {
                stdio: ["pipe", "pipe", "pipe"],
            });
        }
        catch (err) {
            this.logger.error(`[${this.name}] spawn failed: ${String(err)}`);
            this.scheduleReconnect();
            return;
        }
        this.child = child;
        this.ready = true;
        this.stdoutBuffer = "";
        this.stderrBuffer = "";
        this.backoffMs = this.retry.baseMs;
        this.attempts = 0;
        this.logger.info(`[${this.name}] spawned command="${this.command}" args="${this.args.join(" ")}"`);
        this.onReady?.();
        child.stdout.on("data", (chunk) => {
            this.handleStdout(chunk.toString("utf-8"));
        });
        child.stderr.on("data", (chunk) => {
            this.handleStderr(chunk.toString("utf-8"));
        });
        child.on("error", (err) => {
            this.logger.warn(`[${this.name}] process error: ${String(err)}`);
        });
        child.on("close", (code, signal) => {
            if (this.child !== child) {
                return;
            }
            this.ready = false;
            this.child = null;
            this.waitingDrain = false;
            this.onClose?.();
            this.logger.warn(`[${this.name}] exited code=${String(code)} signal=${String(signal)}`);
            this.scheduleReconnect();
        });
        this.flushQueue();
    }
    handleStdout(chunk) {
        this.stdoutBuffer += chunk;
        for (;;) {
            const idx = this.stdoutBuffer.indexOf("\n");
            if (idx < 0) {
                return;
            }
            const rawLine = this.stdoutBuffer.slice(0, idx);
            this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
            const line = rawLine.trim();
            if (!line) {
                continue;
            }
            try {
                const message = JSON.parse(line);
                this.onMessage?.(message);
            }
            catch {
                this.logger.warn(`[${this.name}] invalid ACP stdout json: ${truncate(line, 160)}`);
            }
        }
    }
    handleStderr(chunk) {
        this.stderrBuffer += chunk;
        for (;;) {
            const idx = this.stderrBuffer.indexOf("\n");
            if (idx < 0) {
                return;
            }
            const rawLine = this.stderrBuffer.slice(0, idx);
            this.stderrBuffer = this.stderrBuffer.slice(idx + 1);
            const line = rawLine.trim();
            if (!line) {
                continue;
            }
            this.logger.debug?.(`[${this.name}:stderr] ${line}`);
        }
    }
    enqueue(line) {
        if (this.writeQueue.length >= this.maxBufferedMessages) {
            this.writeQueue.shift();
            this.logger.warn(`[${this.name}] outbound queue full (${this.maxBufferedMessages}), dropping oldest`);
        }
        this.writeQueue.push(line);
    }
    flushQueue() {
        if (!this.child || this.child.stdin.destroyed) {
            return;
        }
        while (this.writeQueue.length > 0) {
            const line = this.writeQueue[0];
            if (!this.writeDirect(line)) {
                return;
            }
            this.writeQueue.shift();
        }
    }
    writeDirect(line) {
        const child = this.child;
        if (!child || child.stdin.destroyed) {
            return false;
        }
        try {
            const writable = child.stdin.write(line, "utf-8");
            if (!writable) {
                if (!this.waitingDrain) {
                    this.waitingDrain = true;
                    child.stdin.once("drain", () => {
                        this.waitingDrain = false;
                        this.flushQueue();
                    });
                }
                return false;
            }
            return true;
        }
        catch (err) {
            this.logger.warn(`[${this.name}] stdin write failed: ${String(err)}`);
            return false;
        }
    }
    scheduleReconnect() {
        if (this.closing) {
            return;
        }
        if (this.retry.maxAttempts > 0 && this.attempts >= this.retry.maxAttempts) {
            this.logger.error(`[${this.name}] retry limit reached, giving up`);
            return;
        }
        const delay = Math.min(this.backoffMs, this.retry.maxMs);
        this.attempts += 1;
        this.backoffMs = Math.min(this.backoffMs * 2, this.retry.maxMs);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
        this.reconnectTimer.unref?.();
    }
}
