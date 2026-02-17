import { asTrimmedNonEmptyString as asString } from "../utils/text.js";
const JSON_RPC_VERSION = "2.0";
const META_DEBUG_INDEX_KEY = "_debug_index";
export class AcpGatewayTransport {
    logger;
    state;
    sendBridgeMessage;
    writeObsEvent;
    sanitizeObsMappingPayload;
    forwardThinkingToBridge;
    forwardToolCallsToBridge;
    constructor(options) {
        this.logger = options.logger;
        this.state = options.state;
        this.sendBridgeMessage = options.sendBridgeMessage;
        this.writeObsEvent = options.writeObsEvent;
        this.sanitizeObsMappingPayload = options.sanitizeObsMappingPayload;
        this.forwardThinkingToBridge = options.forwardThinkingToBridge;
        this.forwardToolCallsToBridge = options.forwardToolCallsToBridge;
    }
    sendSessionUpdate(sessionId, update, requestIdOrMeta, obs) {
        if (!this.shouldForwardSessionUpdate(update)) {
            return;
        }
        const resolvedMeta = this.resolveSessionUpdateMeta(requestIdOrMeta);
        const index = this.state.nextMetaIndex();
        const meta = {
            [META_DEBUG_INDEX_KEY]: index,
            messageType: resolvedMeta.messageType,
        };
        if (resolvedMeta.timestamp !== undefined) {
            meta.timestamp = resolvedMeta.timestamp;
        }
        if (resolvedMeta.requestId !== undefined && resolvedMeta.messageType !== "cron") {
            meta.requestId = resolvedMeta.requestId;
        }
        const payload = {
            jsonrpc: JSON_RPC_VERSION,
            method: "session/update",
            params: {
                sessionId,
                update,
                _meta: meta,
            },
        };
        if (obs?.before !== undefined) {
            const sessionUpdate = asString(update.sessionUpdate) ?? "unknown";
            const protocolError = this.detectObsProtocolError(obs.before);
            this.writeObsEvent?.({
                component: "connector",
                domain: "mapping",
                name: "mapping.gateway_stream_to_session_update",
                severity: protocolError ? "warn" : "info",
                protocolError,
                ...(resolvedMeta.requestId !== undefined ? { requestId: String(resolvedMeta.requestId) } : {}),
                sessionId,
                sessionKey: sessionId,
                hop: obs.hop ?? "openclaw_gateway->plugin",
                where: obs.where ?? "AcpGatewayBridge.sendSessionUpdate",
                summary: `gateway stream -> ACP session/update:${sessionUpdate} (meta.${META_DEBUG_INDEX_KEY}=${index})`,
                before: this.sanitizeObsMappingPayload(obs.before),
                after: this.sanitizeObsMappingPayload(payload),
                payload: {
                    sessionUpdate,
                    metaIndex: index,
                },
            });
        }
        this.sendBridgeMessage(payload);
    }
    sendResult(id, result, sessionId) {
        const responseMeta = this.buildResponseMeta(id, sessionId);
        const payload = {
            jsonrpc: JSON_RPC_VERSION,
            id,
            result: this.attachResponseMetaToResult(result, responseMeta),
        };
        this.sendBridgeMessage(payload);
    }
    sendError(id, code, message, data, sessionId) {
        const responseMeta = this.buildResponseMeta(id, sessionId);
        const payload = {
            jsonrpc: JSON_RPC_VERSION,
            id,
            error: {
                code,
                message,
                data: this.attachResponseMetaToErrorData(data, responseMeta),
            },
        };
        this.sendBridgeMessage(payload);
        this.logger.warn(`[acp] request failed code=${code} message=${message}`);
    }
    buildResponseMeta(id, sessionId) {
        const index = this.state.nextMetaIndex();
        return {
            requestId: id,
            [META_DEBUG_INDEX_KEY]: index,
            ...(sessionId ? { sessionId } : {}),
        };
    }
    attachResponseMetaToResult(result, responseMeta) {
        if (isRecord(result)) {
            const existingMeta = isRecord(result._meta) ? result._meta : undefined;
            return {
                ...result,
                _meta: {
                    ...(existingMeta ?? {}),
                    ...responseMeta,
                },
            };
        }
        if (result === undefined || result === null) {
            return { _meta: responseMeta };
        }
        return {
            value: result,
            _meta: responseMeta,
        };
    }
    attachResponseMetaToErrorData(data, responseMeta) {
        if (isRecord(data)) {
            const existingMeta = isRecord(data._meta) ? data._meta : undefined;
            return {
                ...data,
                _meta: {
                    ...(existingMeta ?? {}),
                    ...responseMeta,
                },
            };
        }
        if (data === undefined) {
            return { _meta: responseMeta };
        }
        return {
            value: data,
            _meta: responseMeta,
        };
    }
    resolveSessionUpdateMeta(input) {
        if (input === undefined) {
            return { requestId: undefined, messageType: "normal" };
        }
        if (typeof input === "string" || typeof input === "number") {
            return { requestId: input, messageType: "normal" };
        }
        const timestamp = this.resolveMetaTimestamp(input.timestamp);
        return {
            requestId: input.requestId,
            messageType: input.messageType === "cron" ? "cron" : "normal",
            timestamp,
        };
    }
    resolveMetaTimestamp(value) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string") {
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return undefined;
    }
    shouldForwardSessionUpdate(update) {
        const sessionUpdate = asString(update.sessionUpdate);
        if (!sessionUpdate) {
            return true;
        }
        if (!this.forwardThinkingToBridge && sessionUpdate === "agent_thought_chunk") {
            return false;
        }
        if (!this.forwardToolCallsToBridge &&
            (sessionUpdate === "tool_call" || sessionUpdate === "tool_call_update")) {
            return false;
        }
        return true;
    }
    detectObsProtocolError(value) {
        if (!isRecord(value)) {
            return false;
        }
        if (Object.prototype.hasOwnProperty.call(value, "error") && value.error !== undefined) {
            return true;
        }
        if (value.ok === false) {
            return true;
        }
        const nestedPayload = isRecord(value.payload) ? value.payload : undefined;
        if (!nestedPayload) {
            return false;
        }
        if (Object.prototype.hasOwnProperty.call(nestedPayload, "error") &&
            nestedPayload.error !== undefined) {
            return true;
        }
        return nestedPayload.ok === false;
    }
}
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
