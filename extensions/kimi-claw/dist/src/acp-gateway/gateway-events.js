import { randomUUID } from "node:crypto";
import { isPlainRecord as isRecord } from "../utils/json.js";
import { MessageQueue } from "../utils/mq.js";
import { asNonEmptyTextChunk as asTextChunk, asTrimmedNonEmptyString as asString, normalizeTransportText, } from "../utils/text.js";
import { resolveUriFileName } from "./prompt-converter.js";
const MAIN_SESSION_KEY = "agent:main:main";
const CRON_SIGNAL_WINDOW_MS = 60 * 1000;
const CRON_ASSISTANT_FLUSH_TIMEOUT_MS = 120_000;
export class AcpGatewayEvents {
    state;
    sendSessionUpdate;
    completePrompt;
    failPrompt;
    replayMissingPromptArtifactsFromLocalHistory;
    cronRunIds = new Set();
    cronRequestIdsByKey = new Map();
    cronAssistantTsByKey = new Map();
    cronAssistantTextByKey = new Map();
    cronAssistantPayloadByKey = new Map();
    cronAssistantFlushTimersByKey = new Map();
    cronAssistantFlushTimeoutMs;
    lastMainCronSignalAtMs = 0;
    currentAssistantStream = null;
    getCurrentAssistantStream() {
        return this.currentAssistantStream;
    }
    constructor(options) {
        this.state = options.state;
        this.sendSessionUpdate = options.sendSessionUpdate;
        this.completePrompt = options.completePrompt;
        this.failPrompt = options.failPrompt;
        this.replayMissingPromptArtifactsFromLocalHistory =
            options.replayMissingPromptArtifactsFromLocalHistory;
        this.cronAssistantFlushTimeoutMs =
            typeof options.cronAssistantFlushTimeoutMs === "number" &&
                Number.isFinite(options.cronAssistantFlushTimeoutMs) &&
                options.cronAssistantFlushTimeoutMs > 0
                ? options.cronAssistantFlushTimeoutMs
                : CRON_ASSISTANT_FLUSH_TIMEOUT_MS;
    }
    handleGatewayResponse(frame) {
        const promptRun = this.state.promptsByGatewayRequestId.get(frame.id);
        if (!promptRun || promptRun.done) {
            return;
        }
        if (!frame.ok) {
            const message = isRecord(frame.error) && asString(frame.error.message)
                ? asString(frame.error.message)
                : "gateway returned error";
            this.failPrompt(promptRun, -32020, message ?? "gateway returned error", frame.error);
            return;
        }
        if (isRecord(frame.payload)) {
            const runId = asString(frame.payload.runId);
            if (runId) {
                this.state.bindPromptRunToRunId(promptRun, runId);
            }
        }
    }
    handleGatewayCronEvent(payload) {
        if (!isRecord(payload)) {
            return;
        }
        const cronPayload = isRecord(payload.payload) ? payload.payload : payload;
        const sessionKey = this.resolveSessionKey(cronPayload) ?? this.resolveSessionKey(payload);
        if (sessionKey && sessionKey !== MAIN_SESSION_KEY) {
            return;
        }
        this.lastMainCronSignalAtMs = Date.now();
        const runId = asString(cronPayload.runId) ??
            asString(cronPayload.run_id) ??
            asString(payload.runId) ??
            asString(payload.run_id);
        if (runId) {
            this.cronRunIds.add(runId);
        }
    }
    handleGatewayAgentEvent(payload) {
        if (!isRecord(payload)) {
            return;
        }
        const promptRun = this.state.resolvePromptRun(payload);
        if (!promptRun || promptRun.done) {
            this.handleUncorrelatedMainCronAssistantEvent(payload);
            return;
        }
        const obsContext = {
            before: { type: "event", event: "agent", payload },
            hop: "openclaw_gateway->plugin",
            where: "AcpGatewayBridge.handleGatewayAgentEvent",
        };
        const stream = asString(payload.stream);
        const data = isRecord(payload.data) ? payload.data : {};
        const streamTimestamp = this.resolvePayloadTimestamp(payload);
        const streamRequestMeta = this.withTimestamp(promptRun.rpcId, streamTimestamp);
        const sendSessionUpdate = (update) => {
            this.sendSessionUpdate(promptRun.sessionId, update, streamRequestMeta, obsContext);
            if (this.currentAssistantStream) {
                const queueEntry = { data: update };
                if (streamTimestamp !== undefined) {
                    queueEntry.ts = streamTimestamp;
                }
                this.currentAssistantStream.push(queueEntry);
            }
        };
        const sendToolCallSpacer = () => {
            sendSessionUpdate({
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "\n" },
            });
        };
        if (stream === "assistant") {
            promptRun.hasAgentAssistantStream = true;
            const text = asTextChunk(data.delta) ?? asTextChunk(data.text);
            if (text) {
                sendSessionUpdate({
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text },
                });
            }
            const contentBlocks = [];
            if (Array.isArray(data.content)) {
                contentBlocks.push(...data.content);
            }
            else if (isRecord(data.content)) {
                contentBlocks.push(data.content);
            }
            else if (typeof data.type === "string") {
                contentBlocks.push(data);
            }
            for (const block of contentBlocks) {
                if (!isRecord(block)) {
                    continue;
                }
                const blockType = asString(block.type);
                if (blockType === "thinking") {
                    promptRun.hasAgentThinkingStream = true;
                    const thought = this.normalizeText(block.thinking) ?? this.normalizeText(block.text);
                    if (!thought) {
                        continue;
                    }
                    sendSessionUpdate({
                        sessionUpdate: "agent_thought_chunk",
                        content: { type: "text", text: thought },
                    });
                    continue;
                }
                if (blockType === "toolCall") {
                    sendToolCallSpacer();
                    promptRun.hasAgentToolStartStream = true;
                    const toolCallId = this.resolveToolCallId(promptRun, block, "start");
                    const title = asString(block.name) ?? asString(block.toolName) ?? asString(block.tool_name) ?? "tool";
                    const args = isRecord(block.arguments)
                        ? block.arguments
                        : isRecord(block.args)
                            ? block.args
                            : {};
                    sendSessionUpdate({
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
                    });
                    continue;
                }
                if (blockType === "toolResult") {
                    sendToolCallSpacer();
                    promptRun.hasAgentToolResultStream = true;
                    const toolCallId = this.resolveToolCallId(promptRun, block, "result");
                    const title = asString(block.name) ?? asString(block.toolName) ?? asString(block.tool_name) ?? "tool";
                    const resultText = this.normalizeText(block.text) ??
                        this.normalizeText(block.result) ??
                        (isRecord(block.result) || Array.isArray(block.result)
                            ? JSON.stringify(block.result, null, 2)
                            : undefined);
                    if (!resultText) {
                        continue;
                    }
                    sendSessionUpdate({
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
                    });
                    continue;
                }
                const normalizedBlock = this.toSessionMessageContentBlock(block);
                if (!normalizedBlock) {
                    continue;
                }
                if (asString(normalizedBlock.type) === "text" && text) {
                    continue;
                }
                sendSessionUpdate({
                    sessionUpdate: "agent_message_chunk",
                    content: normalizedBlock,
                });
            }
            return;
        }
        if (stream === "thinking") {
            promptRun.hasAgentThinkingStream = true;
            const text = asTextChunk(data.delta) ?? asTextChunk(data.text);
            if (text) {
                sendSessionUpdate({
                    sessionUpdate: "agent_thought_chunk",
                    content: { type: "text", text },
                });
            }
            return;
        }
        if (stream === "tool") {
            const phase = asString(data.phase);
            const toolCallId = this.resolveToolCallId(promptRun, data, phase);
            const toolName = asString(data.name) || asString(data.toolName) || asString(data.tool_name) || "tool";
            if (phase === "start") {
                sendToolCallSpacer();
                promptRun.hasAgentToolStartStream = true;
                const args = isRecord(data.arguments) ? data.arguments : isRecord(data.args) ? data.args : {};
                sendSessionUpdate({
                    sessionUpdate: "tool_call",
                    toolCallId,
                    title: toolName,
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
                });
            }
            else if (phase === "result") {
                sendToolCallSpacer();
                promptRun.hasAgentToolResultStream = true;
                const result = data.result ?? data.output ?? data;
                sendSessionUpdate({
                    sessionUpdate: "tool_call_update",
                    toolCallId,
                    status: "completed",
                    content: [
                        {
                            type: "content",
                            content: {
                                type: "text",
                                text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
                            },
                        },
                    ],
                });
            }
            return;
        }
        if (stream === "lifecycle") {
            const phase = asString(data.phase);
            if (phase === "start") {
                this.currentAssistantStream = new MessageQueue();
            }
            else {
                this.currentAssistantStream?.close();
                this.currentAssistantStream = null;
            }
            if (phase === "end") {
                this.clearCronStreamTracking(payload);
                this.replayMissingPromptArtifactsFromLocalHistory(promptRun);
                this.completePrompt(promptRun, "end_turn");
            }
            else if (phase === "cancelled" || phase === "cancel") {
                this.clearCronStreamTracking(payload);
                this.completePrompt(promptRun, "cancelled");
            }
            else if (phase === "error") {
                this.clearCronStreamTracking(payload);
                const nestedErrorMessage = isRecord(data.error) && asString(data.error.message)
                    ? asString(data.error.message)
                    : undefined;
                const message = asString(data.message) ?? nestedErrorMessage ?? "gateway lifecycle error";
                this.failPrompt(promptRun, -32021, message, data);
            }
        }
    }
    handleGatewayChatEvent(payload) {
        if (!isRecord(payload)) {
            return;
        }
        const promptRun = this.state.resolvePromptRun(payload);
        if (!promptRun || promptRun.done) {
            this.handleUncorrelatedMainCronChatEvent(payload);
            return;
        }
        const obsContext = {
            before: { type: "event", event: "chat", payload },
            hop: "openclaw_gateway->plugin",
            where: "AcpGatewayBridge.handleGatewayChatEvent",
        };
        const streamTimestamp = this.resolvePayloadTimestamp(payload);
        const requestMeta = this.withTimestamp(promptRun.rpcId, streamTimestamp);
        const message = isRecord(payload.message) ? payload.message : undefined;
        if (!message) {
            return;
        }
        const role = asString(message.role);
        if (!role) {
            return;
        }
        if (role === "assistant") {
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
                if (!blockType) {
                    continue;
                }
                if (blockType === "thinking") {
                    if (promptRun.hasAgentThinkingStream) {
                        continue;
                    }
                    const thought = this.normalizeText(block.thinking) ?? this.normalizeText(block.text);
                    if (!thought) {
                        continue;
                    }
                    const dedupKey = `chat:thinking:${thought}`;
                    if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                        continue;
                    }
                    promptRun.chatReplayDedupKeys.add(dedupKey);
                    this.sendSessionUpdate(promptRun.sessionId, {
                        sessionUpdate: "agent_thought_chunk",
                        content: { type: "text", text: thought },
                    }, requestMeta, obsContext);
                    continue;
                }
                if (blockType === "toolCall") {
                    this.sendToolCallSpacer(promptRun.sessionId, requestMeta, {
                        before: { type: "event", event: "chat", payload },
                        hop: "openclaw_gateway->plugin",
                        where: "AcpGatewayBridge.handleGatewayChatEvent",
                    });
                    if (promptRun.hasAgentToolStartStream) {
                        continue;
                    }
                    const toolCallId = this.resolveToolCallId(promptRun, block, "start");
                    const title = asString(block.name) ?? asString(block.toolName) ?? asString(block.tool_name) ?? "tool";
                    const args = isRecord(block.arguments)
                        ? block.arguments
                        : isRecord(block.args)
                            ? block.args
                            : {};
                    const dedupKey = `chat:tool_start:${toolCallId}:${JSON.stringify(args)}`;
                    if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                        continue;
                    }
                    promptRun.chatReplayDedupKeys.add(dedupKey);
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
                    }, requestMeta, obsContext);
                    continue;
                }
                if (blockType === "toolResult") {
                    this.sendToolCallSpacer(promptRun.sessionId, requestMeta, {
                        before: { type: "event", event: "chat", payload },
                        hop: "openclaw_gateway->plugin",
                        where: "AcpGatewayBridge.handleGatewayChatEvent",
                    });
                    if (promptRun.hasAgentToolResultStream) {
                        continue;
                    }
                    const toolCallId = this.resolveToolCallId(promptRun, block, "result");
                    const title = asString(block.name) ?? asString(block.toolName) ?? asString(block.tool_name) ?? "tool";
                    const resultText = this.normalizeText(block.text) ??
                        this.normalizeText(block.result) ??
                        (isRecord(block.result) || Array.isArray(block.result)
                            ? JSON.stringify(block.result, null, 2)
                            : undefined);
                    if (!resultText) {
                        continue;
                    }
                    const dedupKey = `chat:tool_result:${toolCallId}:${resultText}`;
                    if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                        continue;
                    }
                    promptRun.chatReplayDedupKeys.add(dedupKey);
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
                    }, requestMeta, obsContext);
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
                    }, requestMeta, obsContext);
                    continue;
                }
                const dedupKey = `chat:assistant_chunk:${JSON.stringify(normalizedBlock)}`;
                if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                    continue;
                }
                promptRun.chatReplayDedupKeys.add(dedupKey);
                this.sendSessionUpdate(promptRun.sessionId, {
                    sessionUpdate: "agent_message_chunk",
                    content: normalizedBlock,
                }, requestMeta, obsContext);
            }
            return;
        }
        if (role === "toolResult") {
            if (promptRun.hasAgentToolResultStream) {
                return;
            }
            const toolCallId = asString(message.toolCallId) ?? asString(message.tool_call_id);
            if (!toolCallId) {
                return;
            }
            const title = asString(message.toolName) ?? asString(message.tool_name) ?? "tool";
            const resultText = this.extractMessageText({ content: message.content });
            if (!resultText) {
                return;
            }
            const dedupKey = `chat:tool_result:${toolCallId}:${resultText}`;
            if (promptRun.chatReplayDedupKeys.has(dedupKey)) {
                return;
            }
            promptRun.chatReplayDedupKeys.add(dedupKey);
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
            }, requestMeta, obsContext);
        }
    }
    handleUncorrelatedMainCronChatEvent(payload) {
        if (this.resolveSessionKey(payload) !== MAIN_SESSION_KEY) {
            return;
        }
        if (!this.isCronAssistantCandidate(payload)) {
            return;
        }
        const message = isRecord(payload.message) ? payload.message : undefined;
        if (!message) {
            return;
        }
        const role = asString(message.role);
        if (role !== "user") {
            return;
        }
        // Cron assistant text is streamed via gateway `agent` events; forwarding chat assistant again
        // here duplicates the same content (typically chat final replay).
        const sessionUpdate = "user_message_chunk";
        const obsContext = {
            before: { type: "event", event: "chat", payload },
            hop: "openclaw_gateway->plugin",
            where: "AcpGatewayBridge.handleGatewayChatEvent.cron",
        };
        const requestMeta = this.resolveCronSessionUpdateMeta(payload);
        const content = message.content;
        const contentBlocks = [];
        if (Array.isArray(content)) {
            contentBlocks.push(...content);
        }
        else if (isRecord(content)) {
            contentBlocks.push(content);
        }
        let forwarded = false;
        for (const block of contentBlocks) {
            if (!isRecord(block)) {
                continue;
            }
            const normalizedBlock = this.toSessionMessageContentBlock(block);
            if (!normalizedBlock) {
                continue;
            }
            this.sendSessionUpdate(MAIN_SESSION_KEY, {
                sessionUpdate,
                content: normalizedBlock,
            }, requestMeta, obsContext);
            forwarded = true;
        }
        if (forwarded) {
            return;
        }
        const text = this.extractMessageText({ content });
        if (!text) {
            return;
        }
        this.sendSessionUpdate(MAIN_SESSION_KEY, {
            sessionUpdate,
            content: { type: "text", text },
        }, requestMeta, obsContext);
    }
    handleUncorrelatedMainCronAssistantEvent(payload) {
        const stream = asString(payload.stream);
        if (stream === "lifecycle") {
            const data = isRecord(payload.data) ? payload.data : {};
            const phase = asString(data.phase);
            if (phase === "end") {
                this.flushCronAssistantText(payload);
                this.clearCronStreamTracking(payload);
            }
            else if (phase === "cancelled" || phase === "cancel" || phase === "error") {
                this.clearCronStreamTracking(payload);
            }
            return;
        }
        if (stream !== "assistant") {
            return;
        }
        if (this.resolveSessionKey(payload) !== MAIN_SESSION_KEY) {
            return;
        }
        if (!this.isCronAssistantCandidate(payload)) {
            return;
        }
        const obsContext = {
            before: { type: "event", event: "agent", payload },
            hop: "openclaw_gateway->plugin",
            where: "AcpGatewayBridge.handleGatewayAgentEvent.cron",
        };
        const requestMeta = this.resolveCronSessionUpdateMeta(payload);
        const data = isRecord(payload.data) ? payload.data : {};
        const text = asTextChunk(data.delta) ?? asTextChunk(data.text);
        if (text) {
            this.bufferCronAssistantText(payload, text, requestMeta, obsContext);
        }
        const contentBlocks = [];
        if (Array.isArray(data.content)) {
            contentBlocks.push(...data.content);
        }
        else if (isRecord(data.content)) {
            contentBlocks.push(data.content);
        }
        else if (typeof data.type === "string") {
            contentBlocks.push(data);
        }
        for (const block of contentBlocks) {
            if (!isRecord(block)) {
                continue;
            }
            const blockType = asString(block.type);
            if (blockType === "thinking" || blockType === "toolCall" || blockType === "toolResult") {
                continue;
            }
            const normalizedBlock = this.toSessionMessageContentBlock(block);
            if (!normalizedBlock) {
                continue;
            }
            if (asString(normalizedBlock.type) === "text") {
                if (text) {
                    continue;
                }
                const blockText = asString(normalizedBlock.text);
                if (blockText) {
                    this.bufferCronAssistantText(payload, blockText, requestMeta, obsContext);
                }
                continue;
            }
            this.sendSessionUpdate(MAIN_SESSION_KEY, {
                sessionUpdate: "agent_message_chunk",
                content: normalizedBlock,
            }, requestMeta, obsContext);
        }
    }
    sendToolCallSpacer(sessionId, requestIdOrMeta, obs) {
        this.sendSessionUpdate(sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "\n" },
        }, requestIdOrMeta, obs);
    }
    isCronAssistantCandidate(payload) {
        const runId = asString(payload.runId) ?? asString(payload.run_id);
        if (runId && this.cronRunIds.has(runId)) {
            return true;
        }
        if (Date.now() - this.lastMainCronSignalAtMs > CRON_SIGNAL_WINDOW_MS) {
            return false;
        }
        if (runId) {
            this.cronRunIds.add(runId);
        }
        return true;
    }
    resolveSessionKey(payload) {
        const direct = asString(payload.sessionKey) ?? asString(payload.session_key);
        if (direct) {
            return direct;
        }
        const nestedPayload = isRecord(payload.payload) ? payload.payload : undefined;
        if (nestedPayload) {
            const nestedPayloadKey = asString(nestedPayload.sessionKey) ?? asString(nestedPayload.session_key);
            if (nestedPayloadKey) {
                return nestedPayloadKey;
            }
        }
        const data = isRecord(payload.data) ? payload.data : undefined;
        if (data) {
            const nested = asString(data.sessionKey) ?? asString(data.session_key);
            if (nested) {
                return nested;
            }
        }
        return undefined;
    }
    resolveCronSessionUpdateMeta(payload) {
        const key = this.resolveCronStreamKey(payload);
        const requestMeta = this.resolveCronSessionUpdateMetaByKey(key);
        const timestamp = this.resolvePayloadTimestamp(payload);
        if (timestamp === undefined) {
            return requestMeta;
        }
        if (key) {
            this.cronAssistantTsByKey.set(key, timestamp);
        }
        if (requestMeta.timestamp !== undefined) {
            return requestMeta;
        }
        return { ...requestMeta, timestamp };
    }
    resolveCronSessionUpdateMetaByKey(key) {
        if (!key) {
            return { requestId: randomUUID(), messageType: "cron" };
        }
        const existing = this.cronRequestIdsByKey.get(key);
        if (existing) {
            const storedTimestamp = this.cronAssistantTsByKey.get(key);
            return storedTimestamp === undefined
                ? { requestId: existing, messageType: "cron" }
                : { requestId: existing, messageType: "cron", timestamp: storedTimestamp };
        }
        const requestId = randomUUID();
        this.cronRequestIdsByKey.set(key, requestId);
        const storedTimestamp = this.cronAssistantTsByKey.get(key);
        return storedTimestamp === undefined
            ? { requestId, messageType: "cron" }
            : { requestId, messageType: "cron", timestamp: storedTimestamp };
    }
    resolveCronStreamKey(payload) {
        const runId = asString(payload.runId) ?? asString(payload.run_id);
        if (runId) {
            return `run:${runId}`;
        }
        const requestId = asString(payload.requestId) ?? asString(payload.request_id);
        if (requestId) {
            return `request:${requestId}`;
        }
        return undefined;
    }
    clearCronStreamTracking(payload) {
        const runId = asString(payload.runId) ?? asString(payload.run_id);
        if (runId) {
            this.clearCronStreamTrackingByKey(`run:${runId}`);
        }
        const requestId = asString(payload.requestId) ?? asString(payload.request_id);
        if (requestId) {
            this.clearCronStreamTrackingByKey(`request:${requestId}`);
        }
    }
    clearCronStreamTrackingByKey(key) {
        this.cronRequestIdsByKey.delete(key);
        this.cronAssistantTsByKey.delete(key);
        this.cronAssistantTextByKey.delete(key);
        this.cronAssistantPayloadByKey.delete(key);
        const timer = this.cronAssistantFlushTimersByKey.get(key);
        if (timer) {
            clearTimeout(timer);
            this.cronAssistantFlushTimersByKey.delete(key);
        }
        if (key.startsWith("run:")) {
            const runId = key.slice("run:".length);
            if (runId) {
                this.cronRunIds.delete(runId);
            }
        }
    }
    bufferCronAssistantText(payload, text, requestMeta, obsContext) {
        const normalized = this.normalizeText(text);
        if (!normalized) {
            return;
        }
        const key = this.resolveCronStreamKey(payload);
        if (!key) {
            this.sendSessionUpdate(MAIN_SESSION_KEY, {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: normalized },
            }, requestMeta, obsContext);
            return;
        }
        const previous = this.cronAssistantTextByKey.get(key) ?? "";
        this.cronAssistantTextByKey.set(key, `${previous}${normalized}`);
        this.cronAssistantPayloadByKey.set(key, payload);
        this.scheduleCronAssistantFlush(key);
    }
    flushCronAssistantText(payload) {
        const key = this.resolveCronStreamKey(payload);
        if (!key) {
            return;
        }
        this.flushCronAssistantTextByKey(key, "end", payload);
    }
    scheduleCronAssistantFlush(key) {
        const existing = this.cronAssistantFlushTimersByKey.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            this.cronAssistantFlushTimersByKey.delete(key);
            this.flushCronAssistantTextByKey(key, "timeout");
        }, this.cronAssistantFlushTimeoutMs);
        this.cronAssistantFlushTimersByKey.set(key, timer);
    }
    flushCronAssistantTextByKey(key, reason, payload) {
        const pendingTimer = this.cronAssistantFlushTimersByKey.get(key);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            this.cronAssistantFlushTimersByKey.delete(key);
        }
        const aggregated = this.cronAssistantTextByKey.get(key);
        if (!aggregated) {
            if (reason === "timeout") {
                this.clearCronStreamTrackingByKey(key);
            }
            return;
        }
        this.cronAssistantTextByKey.delete(key);
        const payloadForObs = payload ?? this.cronAssistantPayloadByKey.get(key);
        this.cronAssistantPayloadByKey.delete(key);
        const normalized = this.normalizeText(aggregated);
        if (!normalized) {
            if (reason === "timeout") {
                this.clearCronStreamTrackingByKey(key);
            }
            return;
        }
        const requestMeta = this.resolveCronSessionUpdateMetaByKey(key);
        const whereSuffix = reason === "timeout" ? "timeout" : "end";
        this.sendSessionUpdate(MAIN_SESSION_KEY, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: normalized },
        }, requestMeta, {
            before: payloadForObs
                ? { type: "event", event: "agent", payload: payloadForObs }
                : { type: "event", event: "cron", payload: { key, reason } },
            hop: "openclaw_gateway->plugin",
            where: `AcpGatewayBridge.handleGatewayAgentEvent.cron.flush.${whereSuffix}`,
        });
        if (reason === "timeout") {
            this.clearCronStreamTrackingByKey(key);
        }
    }
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
    resolvePayloadTimestamp(payload) {
        const directTimestamp = this.resolveTimestampValue(payload.ts);
        if (directTimestamp !== undefined) {
            return directTimestamp;
        }
        const directMessageTimestamp = this.resolveTimestampValue(payload.timestamp);
        if (directMessageTimestamp !== undefined) {
            return directMessageTimestamp;
        }
        const nestedPayload = isRecord(payload.payload) ? payload.payload : undefined;
        if (nestedPayload) {
            const nestedTs = this.resolvePayloadTimestamp(nestedPayload);
            if (nestedTs !== undefined) {
                return nestedTs;
            }
        }
        const nestedData = isRecord(payload.data) ? payload.data : undefined;
        if (nestedData) {
            const nestedTs = this.resolvePayloadTimestamp(nestedData);
            if (nestedTs !== undefined) {
                return nestedTs;
            }
        }
        const nestedMessage = isRecord(payload.message) ? payload.message : undefined;
        if (nestedMessage) {
            const nestedTs = this.resolvePayloadTimestamp(nestedMessage);
            if (nestedTs !== undefined) {
                return nestedTs;
            }
        }
        return undefined;
    }
    withTimestamp(requestIdOrMeta, timestamp) {
        if (timestamp === undefined) {
            return requestIdOrMeta;
        }
        if (typeof requestIdOrMeta === "string" || typeof requestIdOrMeta === "number") {
            return { requestId: requestIdOrMeta, messageType: "normal", timestamp };
        }
        if (requestIdOrMeta.timestamp !== undefined) {
            return requestIdOrMeta;
        }
        return { ...requestIdOrMeta, timestamp };
    }
    resolveTimestampValue(value) {
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
