import os from "node:os";
import path from "node:path";
import { AcpGatewayBridgeCore, sanitizeObsMappingPayload, } from "./acp-gateway/bridge-core.js";
import { AcpGatewayEvents } from "./acp-gateway/gateway-events.js";
import { AcpGatewayHistoryReplay } from "./acp-gateway/history-replay.js";
import { AcpGatewayKimiFileResolver } from "./acp-gateway/kimi-file-resolver.js";
import { AcpGatewayLocalSessionHistory } from "./acp-gateway/local-session-history.js";
import { AcpGatewayPromptConverter } from "./acp-gateway/prompt-converter.js";
import { AcpGatewaySessionState } from "./acp-gateway/session-state.js";
import { AcpGatewayTransport } from "./acp-gateway/transport.js";
import { asTrimmedNonEmptyString as asString } from "./utils/text.js";
const DEFAULT_PROMPT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_HISTORY_PENDING_TIMEOUT_MS = 15 * 1000;
const DEFAULT_KIMIAPI_HOST = "https://www.kimi.com/api-claw";
const DEFAULT_KIMI_FILE_RESOLVE_TIMEOUT_MS = 10000;
const DEFAULT_KIMI_FILE_DOWNLOAD_DIR = "./openclaw/kimi/downloads";
export class AcpGatewayBridge {
    state = new AcpGatewaySessionState();
    historyReplay;
    gatewayEvents;
    core;
    constructor(options) {
        const logger = options.logger;
        const instanceMeta = options.instanceMeta;
        const agentId = options.agentId;
        const isGatewayReady = options.isGatewayReady;
        const sendBridgeMessage = options.sendBridgeMessage;
        const sendGatewayFrame = options.sendGatewayFrame;
        const forceRealtimeVerbose = options.forceRealtimeVerbose === true;
        const forceReasoningStream = options.forceReasoningStream === true;
        const forwardThinkingToBridge = options.forwardThinkingToBridge !== false;
        const forwardToolCallsToBridge = options.forwardToolCallsToBridge !== false;
        const rawPromptTimeoutMs = typeof options.promptTimeoutMs === "number" && Number.isFinite(options.promptTimeoutMs)
            ? Math.trunc(options.promptTimeoutMs)
            : DEFAULT_PROMPT_TIMEOUT_MS;
        const promptTimeoutMs = Math.max(0, rawPromptTimeoutMs);
        const rawHistoryPendingTimeoutMs = typeof options.historyPendingTimeoutMs === "number" &&
            Number.isFinite(options.historyPendingTimeoutMs)
            ? Math.trunc(options.historyPendingTimeoutMs)
            : DEFAULT_HISTORY_PENDING_TIMEOUT_MS;
        const historyPendingTimeoutMs = Math.max(0, rawHistoryPendingTimeoutMs);
        const kimiapiHost = asString(options.kimiapiHost) ?? DEFAULT_KIMIAPI_HOST;
        const kimiBotToken = asString(options.kimiBotToken);
        const rawKimiFileResolveTimeoutMs = typeof options.kimiFileResolveTimeoutMs === "number" &&
            Number.isFinite(options.kimiFileResolveTimeoutMs)
            ? Math.trunc(options.kimiFileResolveTimeoutMs)
            : DEFAULT_KIMI_FILE_RESOLVE_TIMEOUT_MS;
        const kimiFileResolveTimeoutMs = Math.max(1, rawKimiFileResolveTimeoutMs);
        const rawDownloadDir = asString(options.kimiFileDownloadDir) ?? DEFAULT_KIMI_FILE_DOWNLOAD_DIR;
        const kimiFileDownloadDir = path.isAbsolute(rawDownloadDir)
            ? rawDownloadDir
            : path.resolve(os.homedir(), rawDownloadDir);
        const fetchImpl = options.fetchImpl ?? fetch;
        const writeObsEvent = options.writeObsEvent;
        const traceAll = options.traceAll ?? (() => { });
        const localSessionHistory = new AcpGatewayLocalSessionHistory({
            logger,
            agentId,
        });
        const transport = new AcpGatewayTransport({
            logger,
            state: this.state,
            sendBridgeMessage,
            writeObsEvent,
            sanitizeObsMappingPayload,
            forwardThinkingToBridge,
            forwardToolCallsToBridge,
        });
        this.historyReplay = new AcpGatewayHistoryReplay({
            logger,
            state: this.state,
            isGatewayReady,
            sendGatewayFrame,
            sendSessionUpdate: (sessionId, update, requestId) => {
                transport.sendSessionUpdate(sessionId, update, requestId);
            },
            readLocalHistoryMessages: (sessionId, sessionKey) => localSessionHistory.readMessages(sessionId, sessionKey),
            readLocalHistoryEntries: (sessionId, sessionKey) => localSessionHistory.readEntries(sessionId, sessionKey),
            historyPendingTimeoutMs,
        });
        const promptConverter = new AcpGatewayPromptConverter({
            logger,
        });
        const kimiFileResolver = new AcpGatewayKimiFileResolver({
            logger,
            kimiapiHost,
            kimiBotToken,
            kimiFileResolveTimeoutMs,
            kimiFileDownloadDir,
            fetchImpl,
            writeObsEvent,
            traceAll,
        });
        this.core = new AcpGatewayBridgeCore({
            logger,
            instanceMeta,
            agentId,
            state: this.state,
            historyReplay: this.historyReplay,
            promptConverter,
            kimiFileResolver,
            isGatewayReady,
            sendGatewayFrame,
            writeObsEvent,
            forceRealtimeVerbose,
            forceReasoningStream,
            forwardThinkingToBridge,
            forwardToolCallsToBridge,
            promptTimeoutMs,
            sendSessionUpdate: (sessionId, update, requestId) => {
                transport.sendSessionUpdate(sessionId, update, requestId);
            },
            sendResult: (id, result, sessionId) => {
                transport.sendResult(id, result, sessionId);
            },
            sendError: (id, code, message, data, sessionId) => {
                transport.sendError(id, code, message, data, sessionId);
            },
            getCurrentAssistantStream: () => {
                return this.gatewayEvents.getCurrentAssistantStream();
            },
        });
        this.gatewayEvents = new AcpGatewayEvents({
            state: this.state,
            sendSessionUpdate: (sessionId, update, requestId, obs) => {
                transport.sendSessionUpdate(sessionId, update, requestId, obs);
            },
            completePrompt: (promptRun, stopReason) => {
                this.core.completePrompt(promptRun, stopReason);
            },
            failPrompt: (promptRun, code, message, data) => {
                this.core.failPrompt(promptRun, code, message, data);
            },
            replayMissingPromptArtifactsFromLocalHistory: (promptRun) => {
                this.historyReplay.replayMissingPromptArtifactsFromLocalHistory(promptRun);
            },
        });
    }
    handleBridgeMessage(message) {
        this.core.handleBridgeMessage(message);
    }
    handleGatewayFrame(frame) {
        if (frame.type === "res") {
            this.handleGatewayResponse(frame);
            return;
        }
        if (frame.type === "event" && frame.event === "agent") {
            this.gatewayEvents.handleGatewayAgentEvent(frame.payload);
            return;
        }
        if (frame.type === "event" && frame.event === "chat") {
            this.gatewayEvents.handleGatewayChatEvent(frame.payload);
            return;
        }
        if (frame.type === "event" && frame.event === "cron") {
            this.gatewayEvents.handleGatewayCronEvent(frame.payload);
        }
    }
    handleGatewayDisconnected() {
        this.core.handleGatewayDisconnected();
    }
    handleGatewayResponse(frame) {
        if (this.historyReplay.handleHistoryResponse(frame)) {
            return;
        }
        this.gatewayEvents.handleGatewayResponse(frame);
    }
}
