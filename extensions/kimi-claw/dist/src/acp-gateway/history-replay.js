import { randomUUID } from "node:crypto";
import { isPlainRecord as isRecord } from "../utils/json.js";
import { asTrimmedNonEmptyString as asString, normalizeTransportText, } from "../utils/text.js";
import { resolveUriFileName } from "./prompt-converter.js";
export class AcpGatewayHistoryReplay {
    logger;
    state;
    isGatewayReady;
    sendGatewayFrame;
    sendSessionUpdate;
    readLocalHistoryMessages;
    readLocalHistoryEntries;
    historyPendingTimeoutMs;
    constructor(options) {
        this.logger = options.logger;
        this.state = options.state;
        this.isGatewayReady = options.isGatewayReady;
        this.sendGatewayFrame = options.sendGatewayFrame;
        this.sendSessionUpdate = options.sendSessionUpdate;
        this.readLocalHistoryMessages = options.readLocalHistoryMessages;
        this.readLocalHistoryEntries = options.readLocalHistoryEntries;
        this.historyPendingTimeoutMs = options.historyPendingTimeoutMs;
    }
    fetchHistory(sessionId, onComplete, bridgeRequestId) {
        if (!this.isGatewayReady()) {
            this.logger.warn("[acp] skipping history fetch – gateway not ready");
            onComplete?.();
            return;
        }
        const historyRequestId = `hist_${randomUUID().replace(/-/g, "")}`;
        const frame = {
            type: "req",
            id: historyRequestId,
            method: "chat.history",
            params: {
                sessionKey: sessionId,
                limit: 100,
            },
        };
        if (this.sendGatewayFrame(frame)) {
            const pendingRequest = {
                sessionId,
                onComplete,
                requestId: bridgeRequestId,
            };
            if (this.historyPendingTimeoutMs > 0) {
                pendingRequest.timeoutTimer = setTimeout(() => {
                    const timedOutRequest = this.state.takePendingHistoryRequest(historyRequestId);
                    if (!timedOutRequest) {
                        return;
                    }
                    this.logger.warn(`[acp] history request timed out requestId=${historyRequestId} sessionId=${sessionId} timeoutMs=${this.historyPendingTimeoutMs}`);
                    timedOutRequest.onComplete?.();
                }, this.historyPendingTimeoutMs);
                pendingRequest.timeoutTimer.unref?.();
            }
            this.state.setPendingHistoryRequest(historyRequestId, pendingRequest);
            this.logger.info(`[acp] history request sent requestId=${historyRequestId} sessionId=${sessionId} sessionKey=${sessionId}`);
            return;
        }
        this.logger.warn("[acp] failed to send history request to gateway");
        onComplete?.();
    }
    handleHistoryResponse(frame) {
        if (!this.state.hasPendingHistoryRequest(frame.id)) {
            return false;
        }
        const pending = this.state.takePendingHistoryRequest(frame.id);
        if (!pending) {
            return true;
        }
        const sessionId = pending.sessionId;
        const bridgeRequestId = pending.requestId;
        if (!frame.ok) {
            const errMsg = isRecord(frame.error) && asString(frame.error.message)
                ? frame.error.message
                : "unknown";
            this.logger.warn(`[acp] history fetch failed requestId=${frame.id} error=${errMsg}`);
            pending.onComplete?.();
            return true;
        }
        const payload = isRecord(frame.payload) ? frame.payload : {};
        let messages = Array.isArray(payload.messages) ? payload.messages : [];
        if (messages.length === 0) {
            const fallbackSessionId = asString(payload.sessionId) ?? sessionId;
            const fallbackSessionKey = asString(payload.sessionKey) ?? sessionId;
            const localMessages = this.readLocalHistoryEntries(fallbackSessionId, fallbackSessionKey);
            if (localMessages.length > 0) {
                messages = localMessages;
                this.logger.info(`[acp] history fallback from local session files sessionId=${fallbackSessionId} sessionKey=${fallbackSessionKey} count=${messages.length}`);
            }
        }
        this.logger.info(`[acp] history loaded requestId=${frame.id} count=${messages.length}`);
        for (const msg of messages) {
            if (!isRecord(msg)) {
                continue;
            }
            this.replayHistoryMessage(sessionId, msg, bridgeRequestId);
        }
        pending.onComplete?.();
        return true;
    }
    replaySessionLoad(sessionId, requestId) {
        const localMessages = this.readLocalHistoryEntries(sessionId, sessionId);
        for (const msg of localMessages) {
            this.replayHistoryMessage(sessionId, msg, requestId);
        }
        return localMessages.length;
    }
    replayMissingPromptArtifactsFromLocalHistory(promptRun) {
        const localMessages = this.readLocalHistoryEntries(promptRun.sessionId, promptRun.sessionId);
        if (!localMessages.length) {
            return;
        }
        const messageTsFloor = promptRun.startedAt - 2000;
        const scopedMessages = localMessages.filter((message) => typeof message.timestamp === "number" &&
            Number.isFinite(message.timestamp) &&
            message.timestamp >= messageTsFloor);
        if (!scopedMessages.length) {
            return;
        }
        for (const message of scopedMessages) {
            const requestMeta = this.resolveSessionUpdateMeta(promptRun.rpcId, message.timestamp);
            if (message.role === "assistant") {
                const content = [];
                if (Array.isArray(message.content)) {
                    content.push(...message.content);
                }
                else if (typeof message.content === "string") {
                    content.push({ type: "text", text: message.content });
                }
                else if (isRecord(message.content)) {
                    content.push(message.content);
                }
                for (const block of content) {
                    if (!isRecord(block)) {
                        continue;
                    }
                    const blockType = asString(block.type);
                    if (blockType === "thinking") {
                        const thought = this.normalizeText(block.thinking) ?? this.normalizeText(block.text);
                        if (!thought) {
                            continue;
                        }
                        const dedupKey = `local:thinking:${thought}`;
                        if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                            continue;
                        }
                        promptRun.chatReplayDedupKeys.add(dedupKey);
                        promptRun.hasAgentThinkingStream = true;
                        this.sendSessionUpdate(promptRun.sessionId, {
                            sessionUpdate: "agent_thought_chunk",
                            content: { type: "text", text: thought },
                        }, requestMeta);
                        continue;
                    }
                    if (blockType === "toolCall") {
                        const toolCallId = this.resolveToolCallId(promptRun, block, "start");
                        const title = asString(block.name) ??
                            asString(block.toolName) ??
                            asString(block.tool_name) ??
                            "tool";
                        const args = isRecord(block.arguments)
                            ? block.arguments
                            : isRecord(block.args)
                                ? block.args
                                : {};
                        const dedupKey = `local:tool_start:${toolCallId}:${JSON.stringify(args)}`;
                        if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                            continue;
                        }
                        promptRun.chatReplayDedupKeys.add(dedupKey);
                        promptRun.hasAgentToolStartStream = true;
                        this.sendSessionUpdate(promptRun.sessionId, {
                            sessionUpdate: "tool_call",
                            toolCallId,
                            title,
                            status: "in_progress",
                            content: [
                                {
                                    type: "content",
                                    content: {
                                        type: "text",
                                        text: JSON.stringify(args, null, 2),
                                    },
                                },
                            ],
                        }, requestMeta);
                        continue;
                    }
                    if (blockType === "toolResult") {
                        const toolCallId = this.resolveToolCallId(promptRun, block, "result");
                        const title = asString(block.name) ??
                            asString(block.toolName) ??
                            asString(block.tool_name) ??
                            "tool";
                        const resultText = this.normalizeText(block.text) ??
                            this.normalizeText(block.result) ??
                            this.extractMessageText({ content: block.content }) ??
                            (isRecord(block.result) || Array.isArray(block.result)
                                ? JSON.stringify(block.result, null, 2)
                                : undefined);
                        if (!resultText) {
                            continue;
                        }
                        const dedupKey = `local:tool_result:${toolCallId}:${resultText}`;
                        if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                            continue;
                        }
                        promptRun.chatReplayDedupKeys.add(dedupKey);
                        promptRun.hasAgentToolResultStream = true;
                        this.sendSessionUpdate(promptRun.sessionId, {
                            sessionUpdate: "tool_call_update",
                            toolCallId,
                            title,
                            status: "completed",
                            content: [
                                {
                                    type: "content",
                                    content: {
                                        type: "text",
                                        text: resultText,
                                    },
                                },
                            ],
                        }, requestMeta);
                        continue;
                    }
                    const normalizedBlock = this.toSessionMessageContentBlock(block);
                    if (!normalizedBlock) {
                        continue;
                    }
                    const normalizedType = asString(normalizedBlock.type);
                    if (normalizedType === "text") {
                        if (promptRun.hasAgentAssistantStream) {
                            continue;
                        }
                        const normalizedText = asString(normalizedBlock.text);
                        const deltaText = this.toChatAssistantDeltaText(promptRun, normalizedText);
                        if (!deltaText) {
                            continue;
                        }
                        this.sendSessionUpdate(promptRun.sessionId, {
                            sessionUpdate: "agent_message_chunk",
                            content: { type: "text", text: deltaText },
                        }, requestMeta);
                        continue;
                    }
                    const dedupKey = `local:assistant_chunk:${JSON.stringify(normalizedBlock)}`;
                    if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                        continue;
                    }
                    promptRun.chatReplayDedupKeys.add(dedupKey);
                    this.sendSessionUpdate(promptRun.sessionId, {
                        sessionUpdate: "agent_message_chunk",
                        content: normalizedBlock,
                    }, requestMeta);
                }
                continue;
            }
            if (message.role === "toolResult") {
                const toolCallId = message.toolCallId;
                if (!toolCallId) {
                    continue;
                }
                const resultText = this.extractMessageText({ content: message.content });
                if (!resultText) {
                    continue;
                }
                const title = message.toolName ?? "tool";
                const dedupKey = `local:tool_result:${toolCallId}:${resultText}`;
                if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                    continue;
                }
                promptRun.chatReplayDedupKeys.add(dedupKey);
                promptRun.hasAgentToolResultStream = true;
                this.sendSessionUpdate(promptRun.sessionId, {
                    sessionUpdate: "tool_call_update",
                    toolCallId,
                    title,
                    status: "completed",
                    content: [
                        {
                            type: "content",
                            content: {
                                type: "text",
                                text: resultText,
                            },
                        },
                    ],
                }, requestMeta);
            }
        }
    }
    /**
     * Extract plain text from a gateway history message.
     * `content` can be a string or an array of content blocks with `text` fields.
     */
    extractMessageText(msg) {
        const content = msg.content;
        if (typeof content === "string") {
            return this.normalizeText(content);
        }
        if (Array.isArray(content)) {
            const parts = [];
            for (const block of content) {
                if (isRecord(block)) {
                    const text = this.normalizeText(block.text);
                    if (text) {
                        parts.push(text);
                    }
                }
            }
            if (!parts.length) {
                return undefined;
            }
            return this.normalizeText(parts.join("\n"));
        }
        return undefined;
    }
    normalizeText(value) {
        return normalizeTransportText(value);
    }
    toChatAssistantDeltaText(promptRun, text) {
        const normalized = this.normalizeText(text);
        if (!normalized) {
            return undefined;
        }
        const previous = promptRun.chatAssistantTextSoFar;
        if (!previous) {
            promptRun.chatAssistantTextSoFar = normalized;
            return normalized;
        }
        if (normalized === previous) {
            return undefined;
        }
        if (normalized.startsWith(previous)) {
            const delta = normalized.slice(previous.length);
            promptRun.chatAssistantTextSoFar = normalized;
            return delta || undefined;
        }
        if (previous.startsWith(normalized)) {
            return undefined;
        }
        promptRun.chatAssistantTextSoFar = normalized;
        return normalized;
    }
    toSessionMessageContentBlock(block) {
        const blockType = asString(block.type);
        if (!blockType) {
            return undefined;
        }
        if (blockType === "text") {
            const text = this.normalizeText(block.text);
            if (!text) {
                return undefined;
            }
            return { type: "text", text };
        }
        if (blockType === "image") {
            const data = asString(block.data);
            const uri = asString(block.uri);
            if (!data && !uri) {
                return undefined;
            }
            const mimeType = asString(block.mimeType) ?? asString(block.mime_type);
            const fileName = asString(block.fileName) ??
                asString(block.file_name) ??
                asString(block.filename) ??
                asString(block.name) ??
                (uri ? resolveUriFileName(uri) : undefined);
            return {
                type: "image",
                ...(data ? { data } : {}),
                ...(uri ? { uri } : {}),
                ...(mimeType ? { mimeType } : {}),
                ...(fileName ? { fileName } : {}),
            };
        }
        if (blockType === "resource_link") {
            const uri = asString(block.uri);
            if (!uri) {
                return undefined;
            }
            const title = asString(block.title);
            const name = asString(block.name);
            const mimeType = asString(block.mimeType) ?? asString(block.mime_type);
            return {
                type: "resource_link",
                uri,
                ...(title ? { title } : {}),
                ...(name ? { name } : {}),
                ...(mimeType ? { mimeType } : {}),
            };
        }
        if (blockType === "resource") {
            const nestedResource = isRecord(block.resource) ? block.resource : {};
            const uri = asString(nestedResource.uri) ?? asString(block.uri);
            const mimeType = asString(nestedResource.mimeType) ??
                asString(nestedResource.mime_type) ??
                asString(block.mimeType) ??
                asString(block.mime_type);
            const text = this.normalizeText(nestedResource.text) ?? this.normalizeText(block.text);
            const data = asString(nestedResource.data) ?? asString(block.data);
            const fileName = asString(nestedResource.fileName) ??
                asString(nestedResource.file_name) ??
                asString(nestedResource.filename) ??
                asString(nestedResource.name) ??
                asString(block.fileName) ??
                asString(block.file_name) ??
                asString(block.filename) ??
                asString(block.name) ??
                (uri ? resolveUriFileName(uri) : undefined);
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
        if (blockType === "file") {
            const data = asString(block.data);
            const text = this.normalizeText(block.text);
            const uri = asString(block.uri);
            const mimeType = asString(block.mimeType) ?? asString(block.mime_type);
            const fileName = asString(block.fileName) ??
                asString(block.file_name) ??
                asString(block.filename) ??
                asString(block.name) ??
                (uri ? resolveUriFileName(uri) : undefined);
            if (!data && !text && !uri) {
                return undefined;
            }
            return {
                type: "file",
                ...(data ? { data } : {}),
                ...(text ? { text } : {}),
                ...(uri ? { uri } : {}),
                ...(mimeType ? { mimeType } : {}),
                ...(fileName ? { fileName } : {}),
            };
        }
        return undefined;
    }
    replayHistoryMessage(sessionId, msg, requestId) {
        const role = asString(msg.role);
        if (!role) {
            return;
        }
        const requestMeta = this.resolveSessionUpdateMeta(requestId, msg.timestamp);
        if (role === "user") {
            const content = msg.content;
            if (Array.isArray(content)) {
                // If the user message already contains a KIMI_REF marker, we avoid replaying any
                // redundant inlined media blocks (base64) that may have been materialized into
                // local history by other layers. This keeps session/load replay payloads small
                // while preserving the canonical file reference in text.
                let containsKimiRef = false;
                for (const block of content) {
                    if (!isRecord(block) || asString(block.type) !== "text") {
                        continue;
                    }
                    const text = this.normalizeText(block.text);
                    if (text && text.includes("<KIMI_REF")) {
                        containsKimiRef = true;
                        break;
                    }
                }
                let replayedAny = false;
                for (const block of content) {
                    if (!isRecord(block)) {
                        continue;
                    }
                    const normalizedBlock = this.toSessionMessageContentBlock(block);
                    if (!normalizedBlock) {
                        continue;
                    }
                    const normalizedType = asString(normalizedBlock.type);
                    if (containsKimiRef && normalizedType === "image" && asString(normalizedBlock.data) && !asString(normalizedBlock.uri)) {
                        continue;
                    }
                    if (containsKimiRef && normalizedType === "file" && asString(normalizedBlock.data) && !asString(normalizedBlock.uri)) {
                        continue;
                    }
                    if (normalizedType === "text") {
                        const text = asString(normalizedBlock.text);
                        if (text) {
                            const chunks = this.splitKimiRefReplayText(text);
                            if (chunks.length > 1) {
                                replayedAny = true;
                                for (const chunk of chunks) {
                                    const resourceLink = this.toBridgeResourceLinkFromKimiRefLine(chunk);
                                    const replayBlock = resourceLink ?? { type: "text", text: chunk };
                                    this.sendSessionUpdate(sessionId, {
                                        sessionUpdate: "user_message_chunk",
                                        content: replayBlock,
                                    }, requestMeta);
                                }
                                continue;
                            }
                        }
                    }
                    replayedAny = true;
                    this.sendSessionUpdate(sessionId, {
                        sessionUpdate: "user_message_chunk",
                        content: normalizedBlock,
                    }, requestMeta);
                }
                if (replayedAny) {
                    return;
                }
            }
            const text = this.extractMessageText(msg);
            if (!text) {
                return;
            }
            this.sendSessionUpdate(sessionId, {
                sessionUpdate: "user_message_chunk",
                content: { type: "text", text },
            }, requestMeta);
            return;
        }
        if (role === "assistant") {
            const content = msg.content;
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (!isRecord(block)) {
                        continue;
                    }
                    const blockType = asString(block.type);
                    if (blockType === "thinking") {
                        const thought = this.normalizeText(block.thinking) ?? this.normalizeText(block.text);
                        if (!thought) {
                            continue;
                        }
                        this.sendSessionUpdate(sessionId, {
                            sessionUpdate: "agent_thought_chunk",
                            content: { type: "text", text: thought },
                        }, requestMeta);
                        continue;
                    }
                    if (blockType === "toolCall") {
                        const toolCallId = asString(block.id) ??
                            asString(block.toolCallId) ??
                            asString(block.tool_call_id) ??
                            `tc_hist_${this.state.peekNextMetaIndex()}`;
                        const title = asString(block.name) ??
                            asString(block.toolName) ??
                            asString(block.tool_name) ??
                            "tool";
                        const args = isRecord(block.arguments)
                            ? block.arguments
                            : isRecord(block.args)
                                ? block.args
                                : {};
                        this.sendSessionUpdate(sessionId, {
                            sessionUpdate: "tool_call",
                            toolCallId,
                            title,
                            status: "in_progress",
                            content: [
                                {
                                    type: "content",
                                    content: {
                                        type: "text",
                                        text: JSON.stringify(args, null, 2),
                                    },
                                },
                            ],
                        }, requestMeta);
                        continue;
                    }
                    if (blockType === "toolResult") {
                        const toolCallId = asString(block.id) ??
                            asString(block.toolCallId) ??
                            asString(block.tool_call_id);
                        if (!toolCallId) {
                            continue;
                        }
                        const title = asString(block.name) ??
                            asString(block.toolName) ??
                            asString(block.tool_name) ??
                            "tool";
                        const resultText = this.normalizeText(block.text) ??
                            this.normalizeText(block.result) ??
                            this.extractMessageText({ content: block.content }) ??
                            (isRecord(block.result) || Array.isArray(block.result)
                                ? JSON.stringify(block.result, null, 2)
                                : undefined);
                        if (!resultText) {
                            continue;
                        }
                        this.sendSessionUpdate(sessionId, {
                            sessionUpdate: "tool_call_update",
                            toolCallId,
                            title,
                            status: "completed",
                            content: [
                                {
                                    type: "content",
                                    content: {
                                        type: "text",
                                        text: resultText,
                                    },
                                },
                            ],
                        }, requestMeta);
                        continue;
                    }
                    const normalizedBlock = this.toSessionMessageContentBlock(block);
                    if (!normalizedBlock) {
                        continue;
                    }
                    this.sendSessionUpdate(sessionId, {
                        sessionUpdate: "agent_message_chunk",
                        content: normalizedBlock,
                    }, requestMeta);
                }
                return;
            }
            if (isRecord(content)) {
                const normalizedBlock = this.toSessionMessageContentBlock(content);
                if (normalizedBlock) {
                    this.sendSessionUpdate(sessionId, {
                        sessionUpdate: "agent_message_chunk",
                        content: normalizedBlock,
                    }, requestMeta);
                    return;
                }
            }
            const text = this.extractMessageText(msg);
            if (!text) {
                return;
            }
            this.sendSessionUpdate(sessionId, {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text },
            }, requestMeta);
            return;
        }
        if (role === "toolResult") {
            const toolCallId = asString(msg.toolCallId) ?? asString(msg.tool_call_id);
            if (!toolCallId) {
                return;
            }
            const resultText = this.extractMessageText(msg);
            if (!resultText) {
                return;
            }
            const title = asString(msg.toolName) ??
                asString(msg.tool_name) ??
                "tool";
            this.sendSessionUpdate(sessionId, {
                sessionUpdate: "tool_call_update",
                toolCallId,
                title,
                status: "completed",
                content: [
                    {
                        type: "content",
                        content: {
                            type: "text",
                            text: resultText,
                        },
                    },
                ],
            }, requestMeta);
        }
    }
    resolveSessionUpdateMeta(requestId, timestamp) {
        const resolvedTimestamp = this.resolveTimestamp(timestamp);
        if (resolvedTimestamp === undefined) {
            return requestId;
        }
        return {
            requestId,
            messageType: "normal",
            timestamp: resolvedTimestamp,
        };
    }
    resolveTimestamp(value) {
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
    splitKimiRefReplayText(text) {
        if (!text.includes("<KIMI_REF") || !text.includes("\n")) {
            return [text];
        }
        // Preserve original ordering but split standalone `<KIMI_REF ... />` lines into separate
        // chunks so ACP replay looks like `[resource_link]` + `[text]` again.
        const kimiRefLinePattern = /^<KIMI_REF\b[^>]*\/>\s*$/;
        const lines = text.split("\n");
        const chunks = [];
        let buffer = [];
        const flushBuffer = () => {
            if (buffer.length === 0) {
                return;
            }
            const joined = buffer.join("\n");
            buffer = [];
            if (!joined.trim()) {
                return;
            }
            chunks.push(joined);
        };
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("<KIMI_REF") && kimiRefLinePattern.test(trimmed)) {
                flushBuffer();
                chunks.push(trimmed);
                continue;
            }
            buffer.push(line);
        }
        flushBuffer();
        return chunks.length ? chunks : [text];
    }
    toBridgeResourceLinkFromKimiRefLine(text) {
        const trimmed = text.trim();
        if (!trimmed.startsWith("<KIMI_REF")) {
            return undefined;
        }
        // Extract id="..." and optional name="...".
        const idMatch = trimmed.match(/\bid\s*=\s*"([^"]+)"/i);
        if (!idMatch?.[1]) {
            return undefined;
        }
        const fileId = idMatch[1].trim();
        if (!fileId) {
            return undefined;
        }
        const nameMatch = trimmed.match(/\bname\s*=\s*"([^"]+)"/i);
        const name = nameMatch?.[1]?.trim();
        // Keep it aligned with what ACP clients send: a kimi-file resource_link + optional mimeType.
        // We best-effort infer mime from the KIMI_REF name attribute; otherwise default to octet-stream.
        const mimeType = this.guessMimeTypeFromFileName(name) ?? "application/octet-stream";
        return {
            type: "resource_link",
            uri: `kimi-file://${fileId}`,
            ...(name ? { name } : {}),
            mimeType,
        };
    }
    guessMimeTypeFromFileName(fileName) {
        if (!fileName) {
            return undefined;
        }
        const lower = fileName.trim().toLowerCase();
        if (!lower) {
            return undefined;
        }
        if (lower.endsWith(".png"))
            return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
            return "image/jpeg";
        if (lower.endsWith(".webp"))
            return "image/webp";
        if (lower.endsWith(".gif"))
            return "image/gif";
        if (lower.endsWith(".bmp"))
            return "image/bmp";
        if (lower.endsWith(".svg"))
            return "image/svg+xml";
        if (lower.endsWith(".pdf"))
            return "application/pdf";
        if (lower.endsWith(".txt"))
            return "text/plain";
        if (lower.endsWith(".md") || lower.endsWith(".markdown"))
            return "text/markdown";
        if (lower.endsWith(".json"))
            return "application/json";
        if (lower.endsWith(".csv"))
            return "text/csv";
        return undefined;
    }
    resolveToolCallId(promptRun, data, phase) {
        const incomingId = asString(data.toolCallId) ||
            asString(data.tool_call_id) ||
            asString(data.callId) ||
            asString(data.id);
        if (incomingId) {
            const existing = promptRun.toolCallIdsByIncomingId.get(incomingId);
            if (existing) {
                return existing;
            }
            promptRun.toolCallIdsByIncomingId.set(incomingId, incomingId);
            return incomingId;
        }
        if (phase === "result") {
            const pendingGenerated = promptRun.pendingGeneratedToolCallIds.shift();
            if (pendingGenerated) {
                return pendingGenerated;
            }
        }
        promptRun.nextGeneratedToolCallId += 1;
        const generatedId = `tc_${promptRun.gatewayRequestId}_${promptRun.nextGeneratedToolCallId}`;
        if (phase === "start") {
            promptRun.pendingGeneratedToolCallIds.push(generatedId);
        }
        return generatedId;
    }
}
