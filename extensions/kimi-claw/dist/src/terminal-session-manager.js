import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { asTrimmedNonEmptyString as asNonEmptyString } from "./utils/text.js";
export const TERMINAL_SESSION_STATES = {
    opening: "opening",
    running: "running",
    closing: "closing",
    closed: "closed",
};
export const TERMINAL_TIMEOUT_REASONS = {
    idle: "idle_timeout",
    maxDuration: "max_duration_timeout",
};
const ALLOWED_STATE_TRANSITIONS = {
    opening: ["running", "closing", "closed"],
    running: ["closing", "closed"],
    closing: ["closed"],
    closed: [],
};
const isPositiveInteger = (value) => typeof value === "number" && Number.isInteger(value) && value > 0;
const assertPositiveInteger = (value, fieldName) => {
    if (!isPositiveInteger(value)) {
        throw new Error(`[terminal] ${fieldName} must be a positive integer`);
    }
};
const toBuffer = (value) => typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
const chainEventHandler = (current, next) => {
    if (!next) {
        return current;
    }
    if (!current) {
        return next;
    }
    return (event) => {
        current(event);
        next(event);
    };
};
const require = createRequire(import.meta.url);
let cachedNodePty;
const REQUIRE_PTY = process.env.OPENCLAW_BRIDGE_SHELL_REQUIRE_PTY === "1";
const getNodePty = () => {
    if (cachedNodePty) {
        return cachedNodePty;
    }
    try {
        cachedNodePty = require("node-pty");
        return cachedNodePty;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[terminal] failed to load node-pty: ${message}`);
    }
};
const createPipeTerminalProcess = (params) => {
    const child = spawn(params.shell, [], {
        cwd: params.cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
    });
    let exitDelivered = false;
    const emitExit = (event) => {
        if (exitDelivered) {
            return;
        }
        exitDelivered = true;
        params.onExit(event);
    };
    child.stdout.on("data", (chunk) => {
        params.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
        params.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.once("error", (error) => {
        emitExit({
            code: null,
            signal: null,
            error,
        });
    });
    child.once("exit", (code, signal) => {
        emitExit({
            code: typeof code === "number" ? code : null,
            signal: signal ? String(signal) : null,
        });
    });
    return {
        write: (data) => {
            if (child.stdin.destroyed) {
                return;
            }
            child.stdin.write(data);
        },
        resize: (_cols, _rows) => {
            // Pipe fallback does not support PTY resize.
        },
        close: () => {
            if (child.killed) {
                return;
            }
            child.kill();
        },
    };
};
const createPtyTerminalProcess = (params) => {
    const nodePty = getNodePty();
    let pty;
    try {
        pty = nodePty.spawn(params.shell, [], {
            name: process.env.TERM || (process.platform === "win32" ? "xterm-color" : "xterm-256color"),
            cwd: params.cwd,
            env: process.env,
            cols: params.cols,
            rows: params.rows,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[terminal] failed to start pty process: ${message}`);
    }
    let dataListener;
    let exitListener;
    let exitDelivered = false;
    const cleanup = () => {
        dataListener?.dispose?.();
        exitListener?.dispose?.();
    };
    const emitExit = (event) => {
        if (exitDelivered) {
            return;
        }
        exitDelivered = true;
        cleanup();
        params.onExit(event);
    };
    dataListener = pty.onData((chunk) => {
        params.onData(Buffer.from(chunk, "utf8"));
    });
    exitListener = pty.onExit((event) => {
        emitExit({
            code: Number.isFinite(event.exitCode) ? event.exitCode : null,
            signal: Number.isFinite(event.signal) ? String(event.signal) : null,
        });
    });
    return {
        write: (data) => {
            const chunk = data.toString("utf8");
            if (!chunk) {
                return;
            }
            pty.write(chunk);
        },
        resize: (cols, rows) => {
            pty.resize(cols, rows);
        },
        close: () => {
            try {
                pty.kill();
            }
            catch (error) {
                emitExit({
                    code: null,
                    signal: null,
                    ...(error instanceof Error ? { error } : {}),
                });
            }
        },
    };
};
const createDefaultTerminalProcess = (params) => {
    try {
        return createPtyTerminalProcess(params);
    }
    catch (error) {
        if (REQUIRE_PTY) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        process.emitWarning(`[terminal] node-pty unavailable, falling back to pipe mode: ${message}`);
        return createPipeTerminalProcess(params);
    }
};
export class TerminalNotFoundError extends Error {
    terminalId;
    constructor(terminalId) {
        super(`terminal not found: ${terminalId}`);
        this.name = "TerminalNotFoundError";
        this.terminalId = terminalId;
    }
}
export class TerminalClosedError extends Error {
    terminalId;
    state;
    constructor(terminalId, state) {
        super(`terminal is not writable in state=${state}: ${terminalId}`);
        this.name = "TerminalClosedError";
        this.terminalId = terminalId;
        this.state = state;
    }
}
export class TerminalTimeoutError extends TerminalClosedError {
    reason;
    constructor(terminalId, state, reason) {
        super(terminalId, state);
        this.name = "TerminalTimeoutError";
        this.reason = reason;
    }
}
export class TerminalSessionManager {
    defaultShell;
    defaultCwd;
    idleTimeoutMs;
    maxDurationMs;
    now;
    setTimer;
    clearTimer;
    createTerminalId;
    createProcess;
    onOutput;
    onExit;
    onStateChange;
    sessions = new Map();
    constructor(options) {
        const defaultShell = asNonEmptyString(options.defaultShell);
        if (!defaultShell) {
            throw new Error("[terminal] defaultShell must be a non-empty string");
        }
        this.defaultShell = defaultShell;
        this.defaultCwd = asNonEmptyString(options.defaultCwd) ?? process.cwd();
        if (options.idleTimeoutMs !== undefined) {
            assertPositiveInteger(options.idleTimeoutMs, "idleTimeoutMs");
        }
        if (options.maxDurationMs !== undefined) {
            assertPositiveInteger(options.maxDurationMs, "maxDurationMs");
        }
        this.idleTimeoutMs = options.idleTimeoutMs;
        this.maxDurationMs = options.maxDurationMs;
        this.now = options.now ?? (() => Date.now());
        this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
        this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
        this.createTerminalId =
            options.createTerminalId ?? (() => `term_${randomUUID()}`);
        this.createProcess = options.createProcess ?? createDefaultTerminalProcess;
        this.onOutput = options.onOutput;
        this.onExit = options.onExit;
        this.onStateChange = options.onStateChange;
    }
    addListeners(listeners) {
        this.onOutput = chainEventHandler(this.onOutput, listeners.onOutput);
        this.onExit = chainEventHandler(this.onExit, listeners.onExit);
        this.onStateChange = chainEventHandler(this.onStateChange, listeners.onStateChange);
    }
    openSession(request) {
        const sessionId = asNonEmptyString(request.sessionId);
        if (!sessionId) {
            throw new Error("[terminal] sessionId must be a non-empty string");
        }
        assertPositiveInteger(request.cols, "cols");
        assertPositiveInteger(request.rows, "rows");
        const shell = asNonEmptyString(request.shell) ?? this.defaultShell;
        const cwd = asNonEmptyString(request.cwd) ?? this.defaultCwd;
        const startedAt = this.now();
        const terminalId = this.allocateTerminalId();
        const session = {
            terminalId,
            sessionId,
            shell,
            cwd,
            startedAt,
            lastActiveAt: startedAt,
            cols: request.cols,
            rows: request.rows,
            state: TERMINAL_SESSION_STATES.opening,
            nextSeq: 1,
        };
        this.sessions.set(terminalId, session);
        try {
            session.process = this.createProcess({
                shell,
                cwd,
                cols: request.cols,
                rows: request.rows,
                onData: (chunk) => this.handleProcessData(terminalId, chunk),
                onExit: (event) => this.handleProcessExit(terminalId, event),
            });
            this.transitionState(session, TERMINAL_SESSION_STATES.running);
            this.scheduleSessionTimers(session);
        }
        catch (error) {
            this.clearSessionTimers(session);
            this.transitionState(session, TERMINAL_SESSION_STATES.closed);
            this.sessions.delete(terminalId);
            throw error;
        }
        return this.snapshot(session);
    }
    writeToSession(terminalId, data) {
        const session = this.requireSession(terminalId);
        this.assertSessionRunning(session);
        session.process?.write(toBuffer(data));
        this.markSessionActivity(session);
    }
    resizeSession(terminalId, cols, rows) {
        assertPositiveInteger(cols, "cols");
        assertPositiveInteger(rows, "rows");
        const session = this.requireSession(terminalId);
        this.assertSessionRunning(session);
        session.cols = cols;
        session.rows = rows;
        this.markSessionActivity(session);
        session.process?.resize(cols, rows);
    }
    closeSession(terminalId, options) {
        const session = this.requireSession(terminalId);
        if (options?.reason && !session.timeoutReason) {
            session.timeoutReason = options.reason;
        }
        if (session.state === TERMINAL_SESSION_STATES.closed) {
            this.clearSessionTimers(session);
            return this.snapshot(session);
        }
        this.clearSessionTimers(session);
        if (session.state !== TERMINAL_SESSION_STATES.closing) {
            this.transitionState(session, TERMINAL_SESSION_STATES.closing);
            session.process?.close();
        }
        session.lastActiveAt = this.now();
        return this.snapshot(session);
    }
    getSession(terminalId) {
        const session = this.sessions.get(terminalId);
        return session ? this.snapshot(session) : undefined;
    }
    listSessions() {
        return [...this.sessions.values()].map((session) => this.snapshot(session));
    }
    allocateTerminalId() {
        let terminalId = this.createTerminalId().trim();
        while (!terminalId || this.sessions.has(terminalId)) {
            terminalId = this.createTerminalId().trim();
        }
        return terminalId;
    }
    requireSession(terminalId) {
        const normalized = terminalId.trim();
        const session = normalized ? this.sessions.get(normalized) : undefined;
        if (!session) {
            throw new TerminalNotFoundError(terminalId);
        }
        return session;
    }
    assertSessionRunning(session) {
        if (session.state !== TERMINAL_SESSION_STATES.running) {
            if (session.timeoutReason) {
                throw new TerminalTimeoutError(session.terminalId, session.state, session.timeoutReason);
            }
            throw new TerminalClosedError(session.terminalId, session.state);
        }
    }
    transitionState(session, nextState) {
        const prevState = session.state;
        if (prevState === nextState) {
            return;
        }
        const allowed = ALLOWED_STATE_TRANSITIONS[prevState] ?? [];
        if (!allowed.includes(nextState)) {
            throw new Error(`[terminal] invalid state transition ${prevState} -> ${nextState} (${session.terminalId})`);
        }
        session.state = nextState;
        this.onStateChange?.({
            terminalId: session.terminalId,
            sessionId: session.sessionId,
            from: prevState,
            to: nextState,
            at: this.now(),
        });
    }
    handleProcessData(terminalId, chunk) {
        const session = this.sessions.get(terminalId);
        if (!session || session.state === TERMINAL_SESSION_STATES.closed) {
            return;
        }
        this.markSessionActivity(session);
        const seq = session.nextSeq;
        session.nextSeq += 1;
        this.onOutput?.({
            terminalId,
            sessionId: session.sessionId,
            data: chunk,
            seq,
        });
    }
    handleProcessExit(terminalId, event) {
        const session = this.sessions.get(terminalId);
        if (!session) {
            return;
        }
        this.clearSessionTimers(session);
        if (session.state !== TERMINAL_SESSION_STATES.closed) {
            if (session.state !== TERMINAL_SESSION_STATES.closing) {
                this.transitionState(session, TERMINAL_SESSION_STATES.closing);
            }
            this.transitionState(session, TERMINAL_SESSION_STATES.closed);
        }
        session.lastActiveAt = this.now();
        this.onExit?.({
            terminalId: session.terminalId,
            sessionId: session.sessionId,
            code: event.code,
            signal: event.signal,
            ...(event.error ? { error: event.error } : {}),
            ...(session.timeoutReason ? { reason: session.timeoutReason } : {}),
        });
    }
    markSessionActivity(session) {
        session.lastActiveAt = this.now();
        if (session.state === TERMINAL_SESSION_STATES.running) {
            this.refreshIdleTimer(session);
        }
    }
    scheduleSessionTimers(session) {
        if (session.state !== TERMINAL_SESSION_STATES.running) {
            return;
        }
        this.refreshIdleTimer(session);
        this.ensureMaxDurationTimer(session);
    }
    refreshIdleTimer(session) {
        if (session.idleTimer) {
            this.clearTimer(session.idleTimer);
            session.idleTimer = undefined;
        }
        if (this.idleTimeoutMs === undefined) {
            return;
        }
        session.idleTimer = this.setTimer(() => this.handleSessionTimeout(session.terminalId, TERMINAL_TIMEOUT_REASONS.idle), this.idleTimeoutMs);
        session.idleTimer.unref?.();
    }
    ensureMaxDurationTimer(session) {
        if (session.maxDurationTimer || this.maxDurationMs === undefined) {
            return;
        }
        const elapsedMs = Math.max(0, this.now() - session.startedAt);
        const delayMs = this.maxDurationMs - elapsedMs;
        if (delayMs <= 0) {
            this.handleSessionTimeout(session.terminalId, TERMINAL_TIMEOUT_REASONS.maxDuration);
            return;
        }
        session.maxDurationTimer = this.setTimer(() => this.handleSessionTimeout(session.terminalId, TERMINAL_TIMEOUT_REASONS.maxDuration), delayMs);
        session.maxDurationTimer.unref?.();
    }
    clearSessionTimers(session) {
        if (session.idleTimer) {
            this.clearTimer(session.idleTimer);
            session.idleTimer = undefined;
        }
        if (session.maxDurationTimer) {
            this.clearTimer(session.maxDurationTimer);
            session.maxDurationTimer = undefined;
        }
    }
    handleSessionTimeout(terminalId, reason) {
        const session = this.sessions.get(terminalId);
        if (!session || session.state !== TERMINAL_SESSION_STATES.running) {
            return;
        }
        this.closeSession(terminalId, { reason });
    }
    snapshot(session) {
        return {
            terminalId: session.terminalId,
            sessionId: session.sessionId,
            shell: session.shell,
            cwd: session.cwd,
            startedAt: session.startedAt,
            lastActiveAt: session.lastActiveAt,
            cols: session.cols,
            rows: session.rows,
            state: session.state,
        };
    }
}
