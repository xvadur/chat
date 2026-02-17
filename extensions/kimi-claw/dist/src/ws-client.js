import { createHash } from "node:crypto";
import WebSocket from "ws";
const CONNECT_REQUEST_ID = "connect";
const LIVENESS_PING_INTERVAL_MS = 15000;
const LIVENESS_CHECK_INTERVAL_MS = 5000;
const LIVENESS_TIMEOUT_MS = 60000;
export class HandshakeWsClient {
    name;
    url;
    headers;
    logger;
    writeObsEvent;
    obsHop;
    retry;
    buildConnect;
    onFrame;
    onReady;
    onClose;
    ws = null;
    ready = false;
    closing = false;
    backoffMs;
    attempts = 0;
    connectTimer = null;
    reconnectTimer = null;
    connectSent = false;
    connectNonce = null;
    livenessPingTimer = null;
    livenessCheckTimer = null;
    lastSeenAt = 0;
    connectionSeq = 0;
    lastReadyAt = 0;
    currentConnectionId = null;
    constructor(opts) {
        this.name = opts.name;
        this.url = opts.url;
        this.headers = { ...(opts.headers ?? {}) };
        this.logger = opts.logger;
        this.writeObsEvent = opts.writeObsEvent;
        this.obsHop = opts.obsHop;
        this.retry = opts.retry;
        this.buildConnect = opts.buildConnect;
        this.onFrame = opts.onFrame;
        this.onReady = opts.onReady;
        this.onClose = opts.onClose;
        this.backoffMs = opts.retry.baseMs;
    }
    emitTransportEvent(connectionId, event) {
        this.writeObsEvent?.({
            component: "connector",
            domain: "transport",
            name: `transport.${event.name}`,
            severity: event.severity,
            hop: this.obsHop,
            where: "HandshakeWsClient",
            summary: event.summary,
            payload: {
                client: this.name,
                url: this.url,
                connectionId,
                ...event.payload,
            },
            error: event.error,
        });
    }
    emitTransportMessageEvent(connectionId, direction, raw) {
        if (!this.writeObsEvent) {
            return;
        }
        this.writeObsEvent({
            component: "connector",
            domain: "transport",
            name: "transport.message",
            severity: "debug",
            hop: this.obsHop,
            where: "HandshakeWsClient",
            payload: {
                client: this.name,
                url: this.url,
                connectionId,
                direction,
                sizeBytes: Buffer.byteLength(raw, "utf8"),
                payloadHash: createHash("sha256").update(raw).digest("hex"),
            },
        });
    }
    sendRaw(raw) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }
        try {
            this.ws.send(raw);
            if (this.currentConnectionId) {
                this.emitTransportMessageEvent(this.currentConnectionId, "send", raw);
            }
            return true;
        }
        catch (err) {
            this.logger.warn(`[${this.name}] send failed: ${String(err)}`);
            return false;
        }
    }
    start() {
        this.closing = false;
        this.connect();
    }
    stop() {
        this.closing = true;
        this.ready = false;
        this.stopLiveness();
        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch {
                // ignore
            }
        }
        this.ws = null;
        this.currentConnectionId = null;
    }
    isReady() {
        return this.ready;
    }
    send(frame) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.ready) {
            return false;
        }
        try {
            const raw = JSON.stringify(frame);
            return this.sendRaw(raw);
        }
        catch (err) {
            this.logger.warn(`[${this.name}] send failed: ${String(err)}`);
            return false;
        }
    }
    connect() {
        if (this.closing) {
            return;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        const connectionId = `${this.name}-${(this.connectionSeq += 1)}`;
        this.currentConnectionId = connectionId;
        const connectStartedAt = Date.now();
        const attempt = { connectFailed: false };
        this.logger.info(`[${this.name}] connecting to ${this.url}`);
        this.emitTransportEvent(connectionId, { name: "connect_start", severity: "info" });
        this.ws = new WebSocket(this.url, {
            headers: this.headers,
        });
        this.ws.on("open", () => {
            this.markSeen();
            this.startLiveness();
            this.queueConnect();
        });
        this.ws.on("message", (data) => {
            this.markSeen();
            const raw = data.toString();
            this.emitTransportMessageEvent(connectionId, "recv", raw);
            this.handleMessage({
                raw,
                connectionId,
                connectStartedAt,
                attempt,
            });
        });
        this.ws.on("pong", () => {
            this.markSeen();
        });
        this.ws.on("close", (code, reason) => {
            const wasReady = this.ready;
            this.ready = false;
            this.stopLiveness();
            const reasonText = reason.toString();
            this.logger.warn(`[${this.name}] closed code=${code} reason=${reasonText}`);
            this.emitTransportEvent(connectionId, {
                name: "close",
                severity: "warn",
                payload: {
                    closeCode: code,
                    closeReason: reasonText,
                    wasReady,
                    lastReadyAt: this.lastReadyAt ? new Date(this.lastReadyAt).toISOString() : undefined,
                },
            });
            this.onClose?.();
            this.scheduleReconnect(connectionId);
        });
        this.ws.on("error", (err) => {
            this.logger.warn(`[${this.name}] error: ${String(err)}`);
            const message = err instanceof Error ? err.message : String(err);
            if (!this.ready && !attempt.connectFailed) {
                attempt.connectFailed = true;
                this.emitTransportEvent(connectionId, {
                    name: "connect_fail",
                    severity: "warn",
                    summary: message,
                    payload: { durationMs: Date.now() - connectStartedAt },
                    error: { code: "WS_ERROR", message },
                });
            }
        });
    }
    markSeen() {
        this.lastSeenAt = Date.now();
    }
    startLiveness() {
        this.stopLiveness();
        this.markSeen();
        this.livenessPingTimer = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return;
            }
            try {
                this.ws.ping();
            }
            catch (err) {
                this.logger.warn(`[${this.name}] ping failed: ${String(err)}`);
            }
        }, LIVENESS_PING_INTERVAL_MS);
        this.livenessPingTimer.unref?.();
        this.livenessCheckTimer = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return;
            }
            const staleMs = Date.now() - this.lastSeenAt;
            if (staleMs <= LIVENESS_TIMEOUT_MS) {
                return;
            }
            this.logger.warn(`[${this.name}] liveness timeout stale_ms=${staleMs} forcing reconnect`);
            try {
                this.ws.terminate();
            }
            catch {
                // ignore terminate error
            }
        }, LIVENESS_CHECK_INTERVAL_MS);
        this.livenessCheckTimer.unref?.();
    }
    stopLiveness() {
        if (this.livenessPingTimer) {
            clearInterval(this.livenessPingTimer);
            this.livenessPingTimer = null;
        }
        if (this.livenessCheckTimer) {
            clearInterval(this.livenessCheckTimer);
            this.livenessCheckTimer = null;
        }
    }
    handleMessage(params) {
        const raw = params.raw;
        if (this.handleTextHeartbeat(raw)) {
            return;
        }
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            this.logger.warn(`[${this.name}] invalid json payload`);
            return;
        }
        if (!parsed || typeof parsed !== "object") {
            return;
        }
        if (parsed.type === "event" && parsed.event === "connect.challenge") {
            const payload = parsed.payload;
            const nonce = typeof payload?.nonce === "string" ? payload.nonce : undefined;
            if (nonce) {
                this.connectNonce = nonce;
            }
            this.sendConnect();
            return;
        }
        if (parsed.type === "res" && parsed.id === CONNECT_REQUEST_ID) {
            this.handleHandshakeResponse({
                frame: parsed,
                connectionId: params.connectionId,
                connectStartedAt: params.connectStartedAt,
                attempt: params.attempt,
            });
            return;
        }
        if (!this.ready) {
            return;
        }
        this.onFrame?.(parsed);
    }
    handleTextHeartbeat(raw) {
        const normalized = raw.trim().toLowerCase();
        if (normalized === "ping") {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return true;
            }
            this.sendRaw("pong");
            return true;
        }
        if (normalized === "pong") {
            return true;
        }
        return false;
    }
    handleHandshakeResponse(params) {
        const frame = params.frame;
        if (!frame.ok) {
            const message = frame.error?.message ?? "handshake failed";
            this.logger.error(`[${this.name}] handshake rejected: ${message}`);
            if (!params.attempt.connectFailed) {
                params.attempt.connectFailed = true;
                this.emitTransportEvent(params.connectionId, {
                    name: "connect_fail",
                    severity: "error",
                    summary: "handshake rejected",
                    payload: {
                        durationMs: Date.now() - params.connectStartedAt,
                        gatewayErrorCode: frame.error?.code,
                    },
                    error: {
                        code: "HANDSHAKE_REJECTED",
                        message,
                        gatewayError: frame.error,
                    },
                });
            }
            this.ws?.close(1008, "handshake rejected");
            return;
        }
        this.ready = true;
        this.lastReadyAt = Date.now();
        this.backoffMs = this.retry.baseMs;
        this.attempts = 0;
        this.logger.info(`[${this.name}] handshake complete`);
        this.emitTransportEvent(params.connectionId, {
            name: "connect_ok",
            severity: "info",
            payload: { durationMs: Date.now() - params.connectStartedAt },
        });
        this.onReady?.();
    }
    queueConnect() {
        this.connectSent = false;
        this.connectNonce = null;
        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
        }
        this.connectTimer = setTimeout(() => {
            this.sendConnect();
        }, 750);
    }
    sendConnect() {
        if (this.connectSent || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        this.connectSent = true;
        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }
        const frame = this.buildConnect(this.connectNonce ?? undefined);
        try {
            const raw = JSON.stringify(frame);
            this.sendRaw(raw);
        }
        catch (err) {
            this.logger.warn(`[${this.name}] connect send failed: ${String(err)}`);
        }
    }
    scheduleReconnect(connectionId) {
        if (this.closing) {
            return;
        }
        if (this.retry.maxAttempts > 0 && this.attempts >= this.retry.maxAttempts) {
            this.logger.error(`[${this.name}] retry limit reached, giving up`);
            return;
        }
        const delay = Math.min(this.backoffMs, this.retry.maxMs);
        const attempt = this.attempts + 1;
        const nextBackoffMs = Math.min(this.backoffMs * 2, this.retry.maxMs);
        this.emitTransportEvent(connectionId, {
            name: "reconnect_scheduled",
            severity: "info",
            payload: {
                reconnectDelayMs: delay,
                attempt,
                nextBackoffMs,
            },
        });
        this.attempts = attempt;
        this.backoffMs = nextBackoffMs;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
        this.reconnectTimer.unref?.();
    }
}
