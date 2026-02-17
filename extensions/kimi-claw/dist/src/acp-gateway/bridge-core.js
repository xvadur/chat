import { randomUUID } from "node:crypto";
import { sanitizePromptPayload } from "../message-filter.js";
import { isPlainRecord as isRecord } from "../utils/json.js";
import { asTrimmedNonEmptyString as asString } from "../utils/text.js";
import { extractPromptBlocks, parseKimiFileResourceLinkUri } from "./prompt-converter.js";
const DEFAULT_PROTOCOL_VERSION = 1;
const DEFAULT_MODE = {
    id: "default",
    name: "Default",
    description: "Default agent mode",
};
const MAIN_SESSION_KEY = "agent:main:main";
const toJsonError = (message) => ({
    error: { code: -32600, message },
});
const toIso = (ts) => new Date(ts).toISOString();
export const sanitizeObsMappingPayload = (value) => {
    const MAX_INLINE_BASE64_CHARS = 1024;
    const BASE64_PAYLOAD_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
    const binaryKeys = new Set(["content", "data", "dataBase64"]);
    const seen = new WeakMap();
    const omitBase64 = (input) => ({
        _obs: {
            omitted: true,
            kind: "base64",
            length: input.length,
        },
    });
    const visit = (current, parentKey) => {
        if (current === null ||
            current === undefined ||
            typeof current === "boolean" ||
            typeof current === "number") {
            return current;
        }
        if (typeof current === "string") {
            if (parentKey && binaryKeys.has(parentKey) && current.length > MAX_INLINE_BASE64_CHARS) {
                return omitBase64(current);
            }
            const looksBase64 = current.length > MAX_INLINE_BASE64_CHARS &&
                current.length % 4 === 0 &&
                BASE64_PAYLOAD_REGEX.test(current);
            if (looksBase64) {
                return omitBase64(current);
            }
            return current;
        }
        if (Array.isArray(current)) {
            const existing = seen.get(current);
            if (existing) {
                return existing;
            }
            const next = [];
            seen.set(current, next);
            for (const entry of current) {
                next.push(visit(entry));
            }
            return next;
        }
        if (typeof current !== "object") {
            return current;
        }
        const obj = current;
        const existing = seen.get(obj);
        if (existing) {
            return existing;
        }
        const next = Object.create(Object.getPrototypeOf(obj));
        seen.set(obj, next);
        for (const [key, entry] of Object.entries(obj)) {
            next[key] = visit(entry, key);
        }
        return next;
    };
    return visit(value);
};
export class AcpGatewayBridgeCore {
    logger;
    instanceMeta;
    agentId;
    state;
    historyReplay;
    promptConverter;
    kimiFileResolver;
    isGatewayReady;
    sendGatewayFrame;
    writeObsEvent;
    forceRealtimeVerbose;
    forceReasoningStream;
    forwardThinkingToBridge;
    forwardToolCallsToBridge;
    promptTimeoutMs;
    sendSessionUpdate;
    sendResult;
    sendError;
    getCurrentAssistantStream;
    constructor(options) {
        this.logger = options.logger;
        this.instanceMeta = options.instanceMeta;
        this.agentId = options.agentId;
        this.state = options.state;
        this.historyReplay = options.historyReplay;
        this.promptConverter = options.promptConverter;
        this.kimiFileResolver = options.kimiFileResolver;
        this.isGatewayReady = options.isGatewayReady;
        this.sendGatewayFrame = options.sendGatewayFrame;
        this.writeObsEvent = options.writeObsEvent;
        this.forceRealtimeVerbose = options.forceRealtimeVerbose;
        this.forceReasoningStream = options.forceReasoningStream;
        this.forwardThinkingToBridge = options.forwardThinkingToBridge;
        this.forwardToolCallsToBridge = options.forwardToolCallsToBridge;
        this.promptTimeoutMs = options.promptTimeoutMs;
        this.sendSessionUpdate = options.sendSessionUpdate;
        this.sendResult = options.sendResult;
        this.sendError = options.sendError;
        this.getCurrentAssistantStream = options.getCurrentAssistantStream;
    }
    handleBridgeMessage(message) {
        if (!isRecord(message)) {
            return;
        }
        const method = asString(message.method);
        if (!method) {
            return;
        }
        const request = {
            jsonrpc: asString(message.jsonrpc),
            method,
            params: message.params,
        };
        if (typeof message.id === "string" || typeof message.id === "number") {
            request.id = message.id;
        }
        this.handleRequest(request);
    }
    handleGatewayDisconnected() {
        const inFlightPrompts = this.state.getInFlightPrompts();
        const pendingHistoryCount = this.state.pendingHistoryRequests.size;
        for (const promptRun of inFlightPrompts) {
            this.failPrompt(promptRun, -32001, "gateway disconnected");
        }
        for (const [historyRequestId, pending] of this.state.pendingHistoryRequests.entries()) {
            this.state.deletePendingHistoryRequest(historyRequestId);
            if (pending.onComplete && pending.requestId !== undefined) {
                this.sendError(pending.requestId, -32001, "gateway disconnected", undefined, pending.sessionId);
            }
        }
        if (inFlightPrompts.length || pendingHistoryCount) {
            this.logger.warn(`[acp] gateway disconnected; failed in-flight prompts=${inFlightPrompts.length} pending-history=${pendingHistoryCount}`);
        }
    }
    completePrompt(promptRun, stopReason) {
        if (promptRun.done) {
            return;
        }
        promptRun.done = true;
        this.sendResult(promptRun.rpcId, { stopReason }, promptRun.sessionId);
        this.cleanupPrompt(promptRun);
    }
    failPrompt(promptRun, code, message, data) {
        if (promptRun.done) {
            return;
        }
        promptRun.done = true;
        this.sendError(promptRun.rpcId, code, message, data, promptRun.sessionId);
        this.cleanupPrompt(promptRun);
    }
    handleRequest(request) {
        const id = request.id;
        if (id === undefined && request.method !== "session/cancel") {
            return;
        }
        switch (request.method) {
            case "initialize":
                if (id === undefined) {
                    return;
                }
                this.sendResult(id, this.buildInitializeResult(request.params));
                return;
            case "session/new":
                if (id === undefined) {
                    return;
                }
                this.handleSessionNew(id, request.params);
                return;
            case "session/load":
                if (id === undefined) {
                    return;
                }
                this.handleSessionLoad(id, request.params);
                return;
            case "session/list":
                if (id === undefined) {
                    return;
                }
                this.handleSessionList(id);
                return;
            case "session/prompt":
                if (id === undefined) {
                    return;
                }
                this.handleSessionPrompt(id, request.params);
                return;
            case "session/cancel":
                this.handleSessionCancel(id, request.params);
                return;
            case "session/set_model":
                if (id === undefined) {
                    return;
                }
                this.sendResult(id, {});
                return;
            default:
                if (id !== undefined) {
                    this.sendError(id, -32601, `method not found: ${request.method}`);
                }
        }
    }
    buildInitializeResult(params) {
        const requestedProtocolVersion = isRecord(params) &&
            typeof params.protocolVersion === "number" &&
            Number.isFinite(params.protocolVersion)
            ? params.protocolVersion
            : undefined;
        const protocolVersion = requestedProtocolVersion === DEFAULT_PROTOCOL_VERSION
            ? requestedProtocolVersion
            : DEFAULT_PROTOCOL_VERSION;
        if (requestedProtocolVersion !== undefined &&
            requestedProtocolVersion !== DEFAULT_PROTOCOL_VERSION) {
            this.logger.warn(`[acp] unsupported initialize protocolVersion=${requestedProtocolVersion}; using ${DEFAULT_PROTOCOL_VERSION}`);
        }
        const instanceId = asString(this.instanceMeta.instanceId) ?? "connector-instance";
        const deviceId = asString(this.instanceMeta.deviceId) ?? instanceId;
        const pluginVersion = asString(this.instanceMeta.pluginVersion) ?? "0.2.0";
        return {
            protocolVersion,
            agentCapabilities: {
                loadSession: true,
                promptCapabilities: {
                    embeddedContext: true,
                    image: true,
                    audio: false,
                },
                sessionCapabilities: {
                    list: {},
                },
            },
            agentInfo: {
                name: "kimi-claw",
                version: pluginVersion,
            },
            _meta: {
                instanceId,
                deviceId,
            },
        };
    }
    handleSessionNew(id, params) {
        if (!isRecord(params)) {
            this.sendError(id, -32602, "invalid params", toJsonError("params must be object"));
            return;
        }
        const parsed = this.parseSessionNewParams(params);
        if ("error" in parsed) {
            this.sendError(id, -32602, "invalid params", toJsonError(parsed.error));
            return;
        }
        const { cwd } = parsed;
        const sessionId = MAIN_SESSION_KEY;
        this.state.upsertSession(sessionId, cwd);
        this.sendResult(id, {
            sessionId,
            modes: {
                availableModes: [{ ...DEFAULT_MODE }],
                currentModeId: DEFAULT_MODE.id,
            },
            _meta: {
                sessionKey: sessionId,
                instanceId: this.instanceMeta.instanceId,
            },
        }, sessionId);
        this.fetchHistory(sessionId, undefined, id);
    }
    handleSessionLoad(id, params) {
        if (!isRecord(params)) {
            this.sendError(id, -32602, "invalid params");
            return;
        }
        const requestedSessionId = asString(params.sessionId);
        if (!requestedSessionId) {
            this.sendError(id, -32602, "sessionId is required");
            return;
        }
        const sessionId = MAIN_SESSION_KEY;
        // Keep load native: replay from local OpenClaw session files only.
        this.state.upsertSession(sessionId);
        const replayCount = this.historyReplay.replaySessionLoad(sessionId, id);
        this.logger.info(`[acp] session/load local replay sessionId=${sessionId} count=${replayCount}`);
        this.replayCurrentAssistantStream(sessionId, id).catch((err) => {
            this.logger.warn(`[acp] session/load replayCurrentAssistantStream error sessionId=${sessionId} error=${String(err)}`);
        }).finally(() => {
            this.sendResult(id, null, sessionId);
        });
    }
    async replayCurrentAssistantStream(sessionId, bridgeRequestId) {
        const stream = this.getCurrentAssistantStream?.();
        if (!stream) {
            return;
        }
        let offset = 0;
        while (true) {
            const msgs = await stream.read(offset);
            // 如果返回 null，说明 MQ 关闭了，停止循环
            if (msgs === null) {
                console.log(`[${sessionId}] assistant stream resume closed`);
                break;
            }
            for (const msg of msgs) {
                const streamMeta = msg.ts === undefined
                    ? bridgeRequestId
                    : {
                        requestId: bridgeRequestId,
                        messageType: "normal",
                        timestamp: msg.ts,
                    };
                this.historyReplay.sendSessionUpdate(sessionId, msg.data, streamMeta);
                offset++;
            }
        }
    }
    handleSessionList(id) {
        const sessions = [...this.state.sessions.values()]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((s) => ({
            sessionId: s.id,
            cwd: s.cwd,
            title: "OpenClaw Session",
            updatedAt: toIso(s.updatedAt),
        }));
        this.sendResult(id, {
            sessions,
            nextCursor: null,
        });
    }
    handleSessionPrompt(id, params) {
        if (!isRecord(params)) {
            this.sendError(id, -32602, "invalid params");
            return;
        }
        const requestedSessionId = asString(params.sessionId);
        if (!requestedSessionId) {
            this.sendError(id, -32602, "sessionId is required");
            return;
        }
        const sessionId = MAIN_SESSION_KEY;
        const session = this.state.sessions.get(sessionId) ?? this.state.upsertSession(sessionId);
        if (!this.isGatewayReady()) {
            this.sendError(id, -32001, "gateway unavailable");
            return;
        }
        const obsBefore = {
            id,
            method: "session/prompt",
            params,
        };
        const promptBlocks = extractPromptBlocks(sanitizePromptPayload(params.prompt));
        const kimiFilePlan = this.kimiFileResolver.buildResolutionPlan(promptBlocks);
        if (kimiFilePlan.error !== undefined) {
            this.sendError(id, -32602, "invalid params", toJsonError(kimiFilePlan.error));
            return;
        }
        if (kimiFilePlan.fileIds.length > 0) {
            void this.handleSessionPromptWithKimiFileResolution(id, session, sessionId, promptBlocks, kimiFilePlan, obsBefore);
            return;
        }
        const promptConversion = this.promptConverter.toGatewayPrompt(promptBlocks);
        if ("error" in promptConversion) {
            this.sendError(id, -32602, "invalid params", toJsonError(promptConversion.error));
            return;
        }
        this.forwardPromptToGateway(id, session, sessionId, promptBlocks, promptConversion, obsBefore);
    }
    async handleSessionPromptWithKimiFileResolution(id, session, sessionId, promptBlocks, kimiFilePlan, obsBefore) {
        const kimiFileResolutionsByUri = await this.kimiFileResolver.resolveMetadataForPrompt(kimiFilePlan, sessionId, id);
        const promptConversion = this.promptConverter.toGatewayPrompt(promptBlocks, {
            kimiFileResolutionsByUri,
            traceContext: {
                sessionId,
                requestId: id,
            },
        });
        if ("error" in promptConversion) {
            this.sendError(id, -32602, "invalid params", toJsonError(promptConversion.error));
            return;
        }
        this.forwardPromptToGateway(id, session, sessionId, promptBlocks, promptConversion, obsBefore);
    }
    forwardPromptToGateway(rpcId, session, sessionId, promptBlocks, promptConversion, obsBefore) {
        if (promptConversion.kimiFileResolutions.length > 0) {
            const summary = promptConversion.kimiFileResolutions
                .map((resolution) => resolution.status === "resolved"
                ? `${resolution.fileId}:resolved:${resolution.downloadUrlSource}`
                : `${resolution.fileId}:resolve_failed:${resolution.code}`)
                .join(",");
            this.logger.info(`[acp] kimi-file metadata summary requestId=${String(rpcId)} sessionId=${sessionId} items=${summary}`);
        }
        this.maybeSendRealtimeSettingsPatch(sessionId);
        const gatewayMessage = promptConversion.message;
        const gatewayAttachments = promptConversion.attachments;
        const gatewayRequestId = `req_${randomUUID().replace(/-/g, "")}`;
        const frame = {
            type: "req",
            id: gatewayRequestId,
            method: "agent",
            params: {
                agentId: this.agentId,
                sessionKey: sessionId,
                message: gatewayMessage,
                ...(gatewayAttachments.length
                    ? { attachments: gatewayAttachments }
                    : {}),
                deliver: false,
                idempotencyKey: `acp_${sessionId}_${Date.now()}`,
            },
        };
        const forwardThinking = this.forwardThinkingToBridge;
        const forwardToolCalls = this.forwardToolCallsToBridge;
        this.writeObsEvent?.({
            component: "connector",
            domain: "mapping",
            name: "mapping.prompt_to_gateway_agent",
            severity: "info",
            requestId: String(rpcId),
            sessionId,
            sessionKey: sessionId,
            hop: "bridge_ws->plugin",
            where: "AcpGatewayBridge.forwardPromptToGateway",
            summary: `ACP session/prompt -> gateway agent (forwardThinking=${forwardThinking} forwardToolCalls=${forwardToolCalls})`,
            before: sanitizeObsMappingPayload(obsBefore),
            after: sanitizeObsMappingPayload(frame),
            payload: {
                gatewayRequestId,
                forwardThinking,
                forwardToolCalls,
            },
        });
        if (!this.sendGatewayFrame(frame)) {
            this.sendError(rpcId, -32001, "failed to send prompt to gateway");
            return;
        }
        this.emitPromptAsUserSessionUpdates(sessionId, promptBlocks, rpcId, promptConversion.kimiFileResolutions);
        this.sendSessionUpdate(sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "" },
        }, rpcId);
        // Keep the first in-flight request as the active one; later requests are still forwarded.
        if (!session.activePromptGatewayRequestId) {
            session.activePromptGatewayRequestId = gatewayRequestId;
        }
        session.updatedAt = Date.now();
        const promptRun = {
            sessionId,
            rpcId,
            gatewayRequestId,
            startedAt: Date.now(),
            done: false,
            hasAgentAssistantStream: false,
            hasAgentThinkingStream: false,
            hasAgentToolStartStream: false,
            hasAgentToolResultStream: false,
            chatReplayDedupKeys: new Set(),
            nextGeneratedToolCallId: 0,
            pendingGeneratedToolCallIds: [],
            toolCallIdsByIncomingId: new Map(),
            chatAssistantTextSoFar: "",
        };
        this.state.addPromptRun(promptRun);
        this.schedulePromptTimeout(promptRun);
    }
    emitPromptAsUserSessionUpdates(sessionId, promptBlocks, requestId, kimiFileResolutions) {
        const kimiFileNameById = new Map();
        const now = Date.now();
        for (const resolution of kimiFileResolutions) {
            if (resolution.status === "resolved") {
                kimiFileNameById.set(resolution.fileId, resolution.name);
                continue;
            }
            if (resolution.name) {
                kimiFileNameById.set(resolution.fileId, resolution.name);
            }
        }
        for (const block of promptBlocks) {
            const content = this.toUserSessionUpdateContent(block, kimiFileNameById);
            if (!content) {
                continue;
            }
            const requestMeta = {
                requestId,
                timestamp: now,
            };
            this.sendSessionUpdate(sessionId, {
                sessionUpdate: "user_message_chunk",
                content,
            }, requestMeta);
        }
    }
    toUserSessionUpdateContent(block, kimiFileNameById) {
        if (block.type === "text") {
            if (!block.text) {
                return undefined;
            }
            return {
                type: "text",
                text: block.text,
            };
        }
        if (block.type === "image") {
            const mimeType = block.mimeType ?? block.mime_type ?? "application/octet-stream";
            const fileName = block.fileName ?? block.file_name ?? block.name;
            if (!block.data && !block.uri) {
                return undefined;
            }
            return {
                type: "image",
                ...(block.data ? { data: block.data } : {}),
                ...(block.uri ? { uri: block.uri } : {}),
                ...(mimeType ? { mimeType } : {}),
                ...(fileName ? { fileName } : {}),
            };
        }
        if (block.type === "resource_link") {
            if (!block.uri) {
                return undefined;
            }
            const mimeType = block.mimeType ?? block.mime_type;
            const parsedKimiFile = parseKimiFileResourceLinkUri(block.uri);
            const resolvedName = block.name ??
                (parsedKimiFile.fileId ? kimiFileNameById.get(parsedKimiFile.fileId) : undefined);
            return {
                type: "resource_link",
                uri: block.uri,
                ...(block.title ? { title: block.title } : {}),
                ...(resolvedName ? { name: resolvedName } : {}),
                ...(mimeType ? { mimeType } : {}),
            };
        }
        if (block.type === "file") {
            const mimeType = block.mimeType ?? block.mime_type ?? "application/octet-stream";
            const fileName = block.fileName ?? block.file_name ?? block.filename ?? block.name;
            if (!block.data && !block.text && !block.uri) {
                return undefined;
            }
            return {
                type: "file",
                ...(block.data ? { data: block.data } : {}),
                ...(block.text ? { text: block.text } : {}),
                ...(block.uri ? { uri: block.uri } : {}),
                ...(mimeType ? { mimeType } : {}),
                ...(fileName ? { fileName } : {}),
            };
        }
        if (block.type === "resource") {
            const resource = block.resource ?? {};
            const uri = resource.uri ?? block.uri;
            const mimeType = resource.mimeType ??
                resource.mime_type ??
                block.mimeType ??
                block.mime_type;
            const text = resource.text ?? block.text;
            const data = resource.data ?? block.data;
            const fileName = resource.fileName ??
                resource.file_name ??
                resource.filename ??
                resource.name ??
                block.fileName ??
                block.file_name ??
                block.filename ??
                block.name;
            if (!uri && !text && !data) {
                return undefined;
            }
            return {
                type: "resource",
                resource: {
                    ...(uri ? { uri } : {}),
                    ...(mimeType ? { mimeType } : {}),
                    ...(text ? { text } : {}),
                    ...(data ? { data } : {}),
                    ...(fileName ? { fileName } : {}),
                },
            };
        }
        return undefined;
    }
    schedulePromptTimeout(promptRun) {
        if (this.promptTimeoutMs <= 0) {
            return;
        }
        promptRun.timeoutTimer = setTimeout(() => {
            if (promptRun.done) {
                return;
            }
            this.logger.warn(`[acp] prompt timeout waiting lifecycle sessionId=${promptRun.sessionId} requestId=${String(promptRun.rpcId)} gatewayRequestId=${promptRun.gatewayRequestId} timeout_ms=${this.promptTimeoutMs}`);
            this.failPrompt(promptRun, -32022, "gateway lifecycle timeout", {
                timeoutMs: this.promptTimeoutMs,
                requestId: promptRun.gatewayRequestId,
                ...(promptRun.runId ? { runId: promptRun.runId } : {}),
            });
        }, this.promptTimeoutMs);
        promptRun.timeoutTimer.unref?.();
    }
    maybeSendRealtimeSettingsPatch(sessionId) {
        if (!this.forceRealtimeVerbose && !this.forceReasoningStream) {
            return;
        }
        if (!this.isGatewayReady()) {
            return;
        }
        const patchParams = {
            key: sessionId,
        };
        if (this.forceRealtimeVerbose) {
            patchParams.verboseLevel = "on";
        }
        if (this.forceReasoningStream) {
            patchParams.reasoningLevel = "stream";
        }
        const frame = {
            type: "req",
            id: `sess_patch_${randomUUID().replace(/-/g, "")}`,
            method: "sessions.patch",
            params: patchParams,
        };
        if (!this.sendGatewayFrame(frame)) {
            this.logger.warn(`[acp] failed to send realtime session patch sessionId=${sessionId}`);
        }
    }
    handleSessionCancel(id, params) {
        if (!isRecord(params)) {
            if (id !== undefined) {
                this.sendError(id, -32602, "invalid params");
            }
            return;
        }
        const requestedSessionId = asString(params.sessionId);
        if (!requestedSessionId) {
            if (id !== undefined) {
                this.sendError(id, -32602, "sessionId is required");
            }
            return;
        }
        const sessionId = MAIN_SESSION_KEY;
        const explicitRequestId = asString(params.requestId) ?? asString(params.request_id);
        const explicitRunId = asString(params.runId) ?? asString(params.run_id);
        let promptRun = explicitRequestId
            ? this.state.promptsByGatewayRequestId.get(explicitRequestId)
            : undefined;
        if (!promptRun && explicitRunId) {
            promptRun = this.state.promptsByRunId.get(explicitRunId);
        }
        const session = this.state.sessions.get(sessionId);
        const activeRequestId = promptRun?.gatewayRequestId ??
            session?.activePromptGatewayRequestId ??
            [...this.state.promptsByGatewayRequestId.values()].find((run) => run.sessionId === sessionId && !run.done)?.gatewayRequestId;
        if (!promptRun && activeRequestId) {
            promptRun = this.state.promptsByGatewayRequestId.get(activeRequestId);
        }
        if (!session && !promptRun) {
            if (id !== undefined) {
                this.sendError(id, -32602, "unknown sessionId");
            }
            return;
        }
        const cancelRequestId = promptRun?.gatewayRequestId ?? explicitRequestId;
        const cancelRunId = promptRun?.runId ?? explicitRunId;
        if (cancelRequestId || cancelRunId) {
            const cancelParams = {
                sessionKey: sessionId,
            };
            if (cancelRunId) {
                cancelParams.runId = cancelRunId;
            }
            if (cancelRequestId) {
                cancelParams.requestId = cancelRequestId;
            }
            const cancelReq = {
                type: "req",
                id: `cancel_${cancelRequestId ?? cancelRunId ?? sessionId}`,
                method: "agent.cancel",
                params: cancelParams,
            };
            this.sendGatewayFrame(cancelReq);
        }
        if (promptRun && !promptRun.done) {
            this.completePrompt(promptRun, "cancelled");
        }
        if (id !== undefined) {
            this.sendResult(id, {}, sessionId);
        }
    }
    fetchHistory(sessionId, onComplete, bridgeRequestId) {
        this.historyReplay.fetchHistory(sessionId, onComplete, bridgeRequestId);
    }
    parseSessionNewParams(params) {
        const cwdResult = this.readOptionalNonEmptyString(params, "cwd");
        if (cwdResult.error) {
            return { error: cwdResult.error };
        }
        const sessionIdResult = this.resolveNewSessionId(params);
        if ("error" in sessionIdResult) {
            return sessionIdResult;
        }
        return {
            sessionId: sessionIdResult.sessionId,
            cwd: cwdResult.value ?? ".",
        };
    }
    resolveNewSessionId(params) {
        const direct = this.readOptionalNonEmptyString(params, "sessionId");
        if (direct.error) {
            return { error: direct.error };
        }
        if (direct.value) {
            return { sessionId: direct.value };
        }
        if (!isRecord(params._meta)) {
            return { sessionId: `sess_${randomUUID().replace(/-/g, "")}` };
        }
        const meta = params._meta;
        const metaSessionId = this.readOptionalNonEmptyString(meta, "sessionId");
        if (metaSessionId.error) {
            return { error: metaSessionId.error };
        }
        if (metaSessionId.value) {
            return { sessionId: metaSessionId.value };
        }
        const metaSessionKey = this.readOptionalNonEmptyString(meta, "sessionKey");
        if (metaSessionKey.error) {
            return { error: metaSessionKey.error };
        }
        if (metaSessionKey.value) {
            return { sessionId: metaSessionKey.value };
        }
        if (!isRecord(meta.openclaw)) {
            return { sessionId: `sess_${randomUUID().replace(/-/g, "")}` };
        }
        const openclawSessionId = this.readOptionalNonEmptyString(meta.openclaw, "sessionId");
        if (openclawSessionId.error) {
            return { error: openclawSessionId.error };
        }
        if (openclawSessionId.value) {
            return { sessionId: openclawSessionId.value };
        }
        const openclawSessionKey = this.readOptionalNonEmptyString(meta.openclaw, "sessionKey");
        if (openclawSessionKey.error) {
            return { error: openclawSessionKey.error };
        }
        if (openclawSessionKey.value) {
            return { sessionId: openclawSessionKey.value };
        }
        return { sessionId: `sess_${randomUUID().replace(/-/g, "")}` };
    }
    readOptionalNonEmptyString(input, fieldName) {
        if (!Object.prototype.hasOwnProperty.call(input, fieldName)) {
            return {};
        }
        const raw = input[fieldName];
        if (typeof raw !== "string") {
            return { error: `${fieldName} must be a string` };
        }
        const trimmed = raw.trim();
        if (!trimmed) {
            return { error: `${fieldName} must be a non-empty string` };
        }
        return { value: trimmed };
    }
    cleanupPrompt(promptRun) {
        this.state.cleanupPromptRun(promptRun);
    }
}
