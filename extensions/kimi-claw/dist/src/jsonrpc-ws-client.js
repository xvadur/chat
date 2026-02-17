import { createHash } from "node:crypto";
import WebSocket from "ws";
const LIVENESS_PING_INTERVAL_MS = 15000;
const LIVENESS_CHECK_INTERVAL_MS = 5000;
const LIVENESS_TIMEOUT_MS = 1800 * 1000; // 30 minutes
const RECONNECT_NOTIFICATION_TIMEOUT_MS = 60 * 1000; // 1 minute
const KIMI_BOT_TOKEN_HEADER = "X-Kimi-Bot-Token";
export class JsonRpcWsClient {
    name;
    url;
    headers;
    token;
    logger;
    writeObsEvent;
    retry;
    onMessage;
    onReady;
    onClose;
    ws = null;
    ready = false;
    closing = false;
    backoffMs;
    attempts = 0;
    authFailed = false;
    reconnectTimer = null;
    livenessPingTimer = null;
    livenessCheckTimer = null;
    reconnectNotificationTimer = null;
    lastSeenAt = 0;
    connectionSeq = 0;
    currentConnectionId = null;
    constructor(options) {
        this.name = options.name;
        this.url = options.url;
        this.headers = { ...(options.headers ?? {}) };
        this.token = options.token;
        this.logger = options.logger;
        this.writeObsEvent = options.writeObsEvent;
        this.retry = options.retry;
        this.onMessage = options.onMessage;
        this.onReady = options.onReady;
        this.onClose = options.onClose;
        this.backoffMs = options.retry.baseMs;
    }
    emitTransportEvent(connectionId, event) {
        this.writeObsEvent?.({
            component: "connector",
            domain: "transport",
            name: `transport.${event.name}`,
            severity: event.severity,
            hop: "bridge_ws",
            where: "JsonRpcWsClient",
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
            hop: "bridge_ws",
            where: "JsonRpcWsClient",
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
    emitHeartbeatEvent(event) {
        this.writeObsEvent?.({
            trace: "heartbeat",
            component: "connector",
            domain: "transport",
            name: `transport.heartbeat.${event.name}`,
            severity: "debug",
            hop: event.hop,
            where: "JsonRpcWsClient",
            summary: event.summary,
            payload: {
                client: this.name,
                url: this.url,
                connectionId: this.currentConnectionId ?? undefined,
                ...event.payload,
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
        this.authFailed = false;
        this.connect();
    }
    stop() {
        this.closing = true;
        this.authFailed = false;
        this.ready = false;
        this.stopLiveness();
        this.stopReconnectNotificationTimer();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch {
                // ignore close error
            }
        }
        this.ws = null;
        this.currentConnectionId = null;
    }
    isReady() {
        return this.ready;
    }
    send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.ready) {
            return false;
        }
        try {
            const raw = JSON.stringify(message);
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
        const connectionId = `${this.name}-${(this.connectionSeq += 1)}`;
        this.currentConnectionId = connectionId;
        const connectStartedAt = Date.now();
        let opened = false;
        let connectFailed = false;
        this.emitTransportEvent(connectionId, {
            name: "connect_start",
            severity: "info",
        });
        const headers = { ...this.headers };
        if (this.token) {
            headers[KIMI_BOT_TOKEN_HEADER] = this.token;
        }
        this.logger.info(`[${this.name}] connecting to ${this.url}`);
        this.ws = new WebSocket(this.url, {
            headers,
        });
        this.ws.on("open", () => {
            this.ready = true;
            opened = true;
            this.markSeen();
            this.startLiveness();
            this.backoffMs = this.retry.baseMs;
            this.attempts = 0;
            this.logger.info(`[${this.name}] connected`);
            this.emitTransportEvent(connectionId, {
                name: "connect_ok",
                severity: "info",
                payload: {
                    durationMs: Date.now() - connectStartedAt,
                },
            });
            this.onReady?.();
        });
        this.ws.on("message", (data) => {
            this.markSeen();
            const raw = data.toString();
            this.emitTransportMessageEvent(connectionId, "recv", raw);
            if (this.handleTextHeartbeat(raw)) {
                return;
            }
            let parsed;
            try {
                parsed = JSON.parse(raw);
            }
            catch {
                this.logger.warn(`[${this.name}] invalid json payload`);
                return;
            }
            // Check for reconnect notification
            if (this.isReconnectNotification(parsed)) {
                this.logger.info(`[${this.name}] received reconnect notification, starting 1min timer`);
                this.startReconnectNotificationTimer();
            }
            else {
                // Any non-pong message cancels the reconnect timer
                this.stopReconnectNotificationTimer();
            }
            this.onMessage?.(parsed);
        });
        this.ws.on("pong", () => {
            this.markSeen();
            this.emitHeartbeatEvent({
                name: "ws_frame_pong_recv",
                hop: "bridge_ws->plugin",
                summary: "ws frame pong recv",
                payload: {
                    transport: "ws_frame",
                    direction: "inbound",
                },
            });
        });
        this.ws.on("close", (code, reason) => {
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
                },
            });
            this.onClose?.();
            if (code === 4001) {
                this.markAuthFailed("4001");
                return;
            }
            this.scheduleReconnect(connectionId);
        });
        this.ws.on("unexpected-response", (_request, response) => {
            const status = response.statusCode;
            if (status === 401) {
                if (!opened && !connectFailed) {
                    connectFailed = true;
                    this.emitTransportEvent(connectionId, {
                        name: "connect_fail",
                        severity: "error",
                        payload: { httpStatus: 401, durationMs: Date.now() - connectStartedAt },
                        summary: "upgrade rejected (http 401)",
                        error: { code: "HTTP_401", message: "auth failed (http 401)" },
                    });
                }
                this.markAuthFailed("http 401");
                return;
            }
            if (!opened && !connectFailed) {
                connectFailed = true;
                this.emitTransportEvent(connectionId, {
                    name: "connect_fail",
                    severity: "warn",
                    payload: {
                        httpStatus: typeof status === "number" ? status : undefined,
                        durationMs: Date.now() - connectStartedAt,
                    },
                    summary: `unexpected http response status=${String(status ?? "unknown")}`,
                    error: {
                        code: "UNEXPECTED_HTTP_STATUS",
                        message: "unexpected http response during websocket upgrade",
                        httpStatus: status,
                    },
                });
            }
            this.logger.warn(`[${this.name}] unexpected http response status=${String(status ?? "unknown")}`);
            this.scheduleReconnect(connectionId);
        });
        this.ws.on("error", (err) => {
            this.logger.warn(`[${this.name}] error: ${String(err)}`);
            const message = err instanceof Error ? err.message : String(err);
            if (!opened && !connectFailed) {
                connectFailed = true;
                this.emitTransportEvent(connectionId, {
                    name: "connect_fail",
                    severity: "warn",
                    payload: { durationMs: Date.now() - connectStartedAt },
                    summary: message,
                    error: { code: "WS_ERROR", message },
                });
            }
            if (message.includes("401")) {
                this.markAuthFailed("http 401");
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
                this.ws.send(JSON.stringify({ type: "ping" }));
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
    stopReconnectNotificationTimer() {
        if (this.reconnectNotificationTimer) {
            clearTimeout(this.reconnectNotificationTimer);
            this.reconnectNotificationTimer = null;
        }
    }
    startReconnectNotificationTimer() {
        this.stopReconnectNotificationTimer();
        this.reconnectNotificationTimer = setTimeout(() => {
            this.logger.warn(`[${this.name}] reconnect notification timeout (no non-pong message received within 1min), forcing reconnect`);
            if (this.ws) {
                try {
                    this.ws.terminate();
                }
                catch {
                    // ignore terminate error
                }
            }
        }, RECONNECT_NOTIFICATION_TIMEOUT_MS);
    }
    isReconnectNotification(message) {
        if (typeof message !== "object" || message === null) {
            return false;
        }
        const msg = message;
        return msg.jsonrpc === "2.0" && msg.method === "_kimi.com/reconnect";
    }
    handleTextHeartbeat(raw) {
        const normalized = raw.trim().toLowerCase();
        if (normalized === "ping") {
            this.emitHeartbeatEvent({
                name: "text_ping_recv",
                hop: "bridge_ws->plugin",
                summary: "text ping recv",
                payload: {
                    transport: "text",
                    direction: "inbound",
                },
            });
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return true;
            }
            const sent = this.sendRaw("pong");
            if (sent) {
                this.emitHeartbeatEvent({
                    name: "text_pong_sent",
                    hop: "plugin->bridge_ws",
                    summary: "text pong sent",
                    payload: {
                        transport: "text",
                        direction: "outbound",
                    },
                });
            }
            return true;
        }
        if (normalized === "pong") {
            this.emitHeartbeatEvent({
                name: "text_pong_recv",
                hop: "bridge_ws->plugin",
                summary: "text pong recv",
                payload: {
                    transport: "text",
                    direction: "inbound",
                },
            });
            return true;
        }
        return false;
    }
    scheduleReconnect(connectionId) {
        this.stopReconnectNotificationTimer();
        if (this.closing) {
            return;
        }
        if (this.authFailed) {
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
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
        this.reconnectTimer.unref?.();
    }
    markAuthFailed(reason) {
        if (this.authFailed) {
            return;
        }
        this.authFailed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.logger.error(`[${this.name}] auth failed (${reason}), will not retry`);
    }
}
