import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { asTrimmedNonEmptyString } from "./utils/text.js";
const DEFAULT_LOCAL_CONFIG_PATH = join(homedir(), ".kimi", "kimi-claw", "kimi-claw-config.json");
const DEFAULT_OPENCLAW_CONFIG_PATH = join(homedir(), ".openclaw", "openclaw.json");
const DEFAULT_OPENCLAW_MIRROR_PATH = join(homedir(), ".kimi", "kimi-claw", "openclaw.json");
export function loadLocalFileConfig(filePath) {
    const configPath = filePath ?? DEFAULT_LOCAL_CONFIG_PATH;
    try {
        const raw = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    }
    catch {
        return {};
    }
}
export function syncKimiPluginApiKeyFromKimiCodeApiKeyInLocalConfig(params) {
    const configPath = params?.localConfigPath ?? DEFAULT_LOCAL_CONFIG_PATH;
    let config;
    try {
        const raw = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {
                configPath,
                updated: false,
                reason: "config_invalid",
            };
        }
        config = parsed;
    }
    catch (error) {
        const err = error;
        return {
            configPath,
            updated: false,
            reason: err?.code === "ENOENT" ? "config_missing" : "config_invalid",
            error: err?.message,
        };
    }
    const bridge = config.bridge;
    if (!bridge || typeof bridge !== "object" || Array.isArray(bridge)) {
        return {
            configPath,
            updated: false,
            reason: "bridge_missing",
        };
    }
    const bridgeRecord = bridge;
    const pluginApiKey = asTrimmedNonEmptyString(bridgeRecord.kimiPluginAPIKey);
    if (pluginApiKey) {
        return {
            configPath,
            updated: false,
            reason: "plugin_key_present",
        };
    }
    const codeApiKey = asTrimmedNonEmptyString(bridgeRecord.kimiCodeAPIKey);
    if (!codeApiKey) {
        return {
            configPath,
            updated: false,
            reason: "code_key_missing",
        };
    }
    bridgeRecord.kimiPluginAPIKey = codeApiKey;
    try {
        writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
        return {
            configPath,
            updated: true,
        };
    }
    catch (error) {
        const err = error;
        return {
            configPath,
            updated: false,
            reason: "write_failed",
            error: err?.message,
        };
    }
}
export function mirrorOpenClawConfigToLocalDir(params) {
    const env = params?.env ?? process.env;
    const sourcePath = params?.openclawConfigPath ?? readString(env.OPENCLAW_CONFIG_PATH) ?? DEFAULT_OPENCLAW_CONFIG_PATH;
    const destinationPath = params?.mirrorPath ?? DEFAULT_OPENCLAW_MIRROR_PATH;
    if (resolve(sourcePath) === resolve(destinationPath)) {
        return {
            sourcePath,
            destinationPath,
            copied: false,
            reason: "same_path",
        };
    }
    try {
        mkdirSync(dirname(destinationPath), { recursive: true });
        copyFileSync(sourcePath, destinationPath);
        return {
            sourcePath,
            destinationPath,
            copied: true,
        };
    }
    catch (error) {
        const err = error;
        return {
            sourcePath,
            destinationPath,
            copied: false,
            reason: err?.code === "ENOENT" ? "source_missing" : "copy_failed",
            error: err?.message,
        };
    }
}
const DEFAULT_BRIDGE_URL_FALLBACK = "wss://www.kimi.com/api-claw/bots/agent-ws";
// GET {claw_host}/bots/agent-ws
const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";
const DEFAULT_PROTOCOL = 3;
const DEFAULT_CLIENT_ID = "gateway-client";
const DEFAULT_CLIENT_MODE = "backend";
const DEFAULT_AGENT_ID = "main";
const DEFAULT_BRIDGE_MODE = "acp";
const DEFAULT_INSTANCE_ID_PREFIX = "connector";
const DEFAULT_DEVICE_ID = "unknown-device";
const DEFAULT_KIMIAPI_HOST_FALLBACK = "https://www.kimi.com/api-claw";
const DEFAULT_KIMI_FILE_DOWNLOAD_DIR = "./openclaw/kimi/downloads";
// MUST SET THINKING AND TOOL CALLS TO FALSE FOR NOW
const DEFAULT_FORWARD_THINKING = false;
const DEFAULT_FORWARD_TOOL_CALLS = false;
const DEFAULT_PROMPT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_HISTORY_PENDING_TIMEOUT_MS = 15 * 1000;
const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_RETRY_MAX_MS = 600000;
const DEFAULT_RETRY_MAX_ATTEMPTS = 0;
const DEFAULT_LOG_DIR = join(homedir(), ".kimi", "kimi-claw", "log");
const DEFAULT_LOG_ENABLED = true;
const DEFAULT_VERBOSE_LOG = false;
const DEFAULT_FORWARD_LOG_FILE = join(DEFAULT_LOG_DIR, "openclaw_forward_chain.log");
const DEFAULT_REPLY_LOG_FILE = join(DEFAULT_LOG_DIR, "openclaw_reply_stream.log");
const DEFAULT_ALL_LOG_FILE = join(DEFAULT_LOG_DIR, "openclaw_all_trace.log");
const DEFAULT_TERMINAL_PAYLOAD_MODE = "artifact";
const DEFAULT_TERMINAL_ARTIFACT_DIR = "/tmp/openclaw_obs_artifacts";
const DEFAULT_MODEL_ENABLED = false;
const DEFAULT_MODEL_PROVIDER = "kimi-coding";
const DEFAULT_MODEL_ID = "k2p5";
const DEFAULT_MODEL_BASE_URL = "https://api.kimi.com/coding";
const DEFAULT_SHELL_ENABLED = false;
const DEFAULT_SHELL_MAX_CONCURRENT_SESSIONS = 2;
const DEFAULT_SHELL_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_SHELL_MAX_DURATION_MS = 60 * 60 * 1000;
const DEFAULT_SHELL_DEFAULT_SHELL = "/bin/bash";
const readString = (value) => asTrimmedNonEmptyString(value);
const resolveDefaultBridgeUrl = (env) => readString(env.OPENCLAW_DEFAULT_BRIDGE_URL) ?? DEFAULT_BRIDGE_URL_FALLBACK;
const resolveDefaultKimiapiHost = (env) => readString(env.OPENCLAW_DEFAULT_KIMIAPI_HOST) ?? DEFAULT_KIMIAPI_HOST_FALLBACK;
const readNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const readInteger = (value) => typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
const readIntegerLike = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.trunc(value);
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
        return undefined;
    }
    return Math.trunc(parsed);
};
const readBoolean = (value) => typeof value === "boolean" ? value : undefined;
const readBooleanLike = (value) => {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }
    return undefined;
};
const pickRequired = (candidates, fallback) => {
    for (const candidate of candidates) {
        if (candidate.value !== undefined) {
            return { value: candidate.value, source: candidate.source };
        }
    }
    return fallback;
};
const pickOptional = (candidates) => {
    for (const candidate of candidates) {
        if (candidate.value !== undefined) {
            return { value: candidate.value, source: candidate.source };
        }
    }
    return { value: undefined, source: "default" };
};
const pickTruthyNumber = (candidates, fallback) => {
    for (const candidate of candidates) {
        if (candidate.value) {
            return { value: candidate.value, source: candidate.source };
        }
    }
    return fallback;
};
const normalizeBridgeMode = (value) => {
    const raw = readString(value);
    if (raw === "gateway" || raw === "acp") {
        return raw;
    }
    return undefined;
};
const normalizeTerminalPayloadMode = (value) => {
    const raw = readString(value);
    if (raw === "artifact" || raw === "inline" || raw === "size_only") {
        return raw;
    }
    return undefined;
};
const validateResolvedConfig = (params) => {
    const issues = [];
    if (!params.config.bridge.token) {
        issues.push({
            code: "CONFIG_BRIDGE_TOKEN_MISSING",
            severity: "error",
            message: "bridge.token missing; remote ACP WebSocket auth may fail",
            nextSteps: [
                "Set OPENCLAW_BRIDGE_TOKEN=<BOT_TOKEN> (or run ./scripts/install_plugin.sh --bot-token <BOT_TOKEN>)",
                `Or set bridge.token in ${params.localConfigPath}`,
                "Or set plugins.entries.kimi-claw.config.bridge.token in ~/.openclaw/openclaw.json",
            ],
        });
    }
    if (params.config.bridge.mode === "gateway" && !params.config.bridge.userId) {
        issues.push({
            code: "CONFIG_BRIDGE_USER_ID_MISSING",
            severity: "error",
            message: "bridge.userId missing in gateway mode",
            nextSteps: [
                "Set OPENCLAW_BRIDGE_USER_ID=<USER_ID>",
                "Or set plugins.entries.kimi-claw.config.bridge.userId in ~/.openclaw/openclaw.json",
            ],
        });
    }
    return issues;
};
export function resolveConnectorConfigWithMeta(params) {
    const env = params.env ?? process.env;
    const pluginConfig = params.pluginConfig ?? {};
    const openclawConfig = params.openclawConfig;
    const localConfigPath = params.localConfigPath ?? DEFAULT_LOCAL_CONFIG_PATH;
    const localConfig = loadLocalFileConfig(localConfigPath);
    const defaultBridgeUrl = resolveDefaultBridgeUrl(env);
    const defaultKimiapiHost = resolveDefaultKimiapiHost(env);
    const bridgeUrlPick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_BRIDGE_URL) },
        { source: "localConfig", value: readString(localConfig.bridge?.url) },
        { source: "pluginConfig", value: readString(pluginConfig.bridge?.url) },
    ], { source: "default", value: defaultBridgeUrl });
    const bridgeUserIdPick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_BRIDGE_USER_ID) },
        { source: "localConfig", value: readString(localConfig.bridge?.userId) },
        { source: "pluginConfig", value: readString(pluginConfig.bridge?.userId) },
    ], { source: "default", value: "" });
    const bridgeTokenPick = pickOptional([
        { source: "env", value: readString(env.OPENCLAW_BRIDGE_TOKEN) },
        { source: "localConfig", value: readString(localConfig.bridge?.token) },
        { source: "pluginConfig", value: readString(pluginConfig.bridge?.token) },
    ]);
    const bridgeKimiapiHostFromEnv = readString(env.OPENCLAW_KIMIAPI_HOST) || readString(env.OPENCLAW_BRIDGE_KIMIAPI_HOST);
    const bridgeKimiapiHostPick = pickRequired([
        { source: "env", value: bridgeKimiapiHostFromEnv },
        { source: "localConfig", value: readString(localConfig.bridge?.kimiapiHost) },
        { source: "pluginConfig", value: readString(pluginConfig.bridge?.kimiapiHost) },
    ], { source: "default", value: defaultKimiapiHost });
    const bridgeKimiFileDownloadDirFromEnv = readString(env.OPENCLAW_KIMI_FILE_DOWNLOAD_DIR) ||
        readString(env.OPENCLAW_BRIDGE_KIMI_FILE_DOWNLOAD_DIR);
    const bridgeKimiFileDownloadDirPick = pickRequired([
        { source: "env", value: bridgeKimiFileDownloadDirFromEnv },
        { source: "localConfig", value: readString(localConfig.bridge?.kimiFileDownloadDir) },
        { source: "pluginConfig", value: readString(pluginConfig.bridge?.kimiFileDownloadDir) },
    ], { source: "default", value: DEFAULT_KIMI_FILE_DOWNLOAD_DIR });
    const bridgeProtocolPick = pickTruthyNumber([
        { source: "localConfig", value: readNumber(localConfig.bridge?.protocol) },
        { source: "pluginConfig", value: readNumber(pluginConfig.bridge?.protocol) },
    ], { source: "default", value: DEFAULT_PROTOCOL });
    const bridgeModePick = pickRequired([
        { source: "env", value: normalizeBridgeMode(env.OPENCLAW_BRIDGE_MODE) },
        { source: "localConfig", value: normalizeBridgeMode(localConfig.bridge?.mode) },
        { source: "pluginConfig", value: normalizeBridgeMode(pluginConfig.bridge?.mode) },
    ], { source: "default", value: DEFAULT_BRIDGE_MODE });
    const bridgeInstanceIdPick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_BRIDGE_INSTANCE_ID) },
        { source: "env", value: readString(env.OPENCLAW_INSTANCE_ID) },
        { source: "localConfig", value: readString(localConfig.bridge?.instanceId) },
        { source: "pluginConfig", value: readString(pluginConfig.bridge?.instanceId) },
    ], { source: "default", value: `${DEFAULT_INSTANCE_ID_PREFIX}-${process.pid}` });
    const bridgeDeviceIdPick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_BRIDGE_DEVICE_ID) },
        { source: "env", value: readString(env.OPENCLAW_DEVICE_ID) },
        { source: "localConfig", value: readString(localConfig.bridge?.deviceId) },
        { source: "pluginConfig", value: readString(pluginConfig.bridge?.deviceId) },
    ], { source: "default", value: DEFAULT_DEVICE_ID });
    const bridgeForwardThinkingPick = pickRequired([
        { source: "env", value: readBooleanLike(env.OPENCLAW_BRIDGE_FORWARD_THINKING) },
        { source: "localConfig", value: readBoolean(localConfig.bridge?.forwardThinking) },
        { source: "pluginConfig", value: readBoolean(pluginConfig.bridge?.forwardThinking) },
    ], { source: "default", value: DEFAULT_FORWARD_THINKING });
    const bridgeForwardToolCallsPick = pickRequired([
        { source: "env", value: readBooleanLike(env.OPENCLAW_BRIDGE_FORWARD_TOOL_CALLS) },
        { source: "localConfig", value: readBoolean(localConfig.bridge?.forwardToolCalls) },
        { source: "pluginConfig", value: readBoolean(pluginConfig.bridge?.forwardToolCalls) },
    ], { source: "default", value: DEFAULT_FORWARD_TOOL_CALLS });
    const bridgePromptTimeoutMsPick = pickRequired([
        { source: "env", value: readIntegerLike(env.OPENCLAW_BRIDGE_PROMPT_TIMEOUT_MS) },
        { source: "localConfig", value: readInteger(localConfig.bridge?.promptTimeoutMs) },
        { source: "pluginConfig", value: readInteger(pluginConfig.bridge?.promptTimeoutMs) },
    ], { source: "default", value: DEFAULT_PROMPT_TIMEOUT_MS });
    const bridgePromptTimeoutMs = Math.max(0, bridgePromptTimeoutMsPick.value);
    const bridgeHistoryPendingTimeoutMsPick = pickRequired([
        { source: "env", value: readIntegerLike(env.OPENCLAW_BRIDGE_HISTORY_PENDING_TIMEOUT_MS) },
        { source: "localConfig", value: readInteger(localConfig.bridge?.historyPendingTimeoutMs) },
        { source: "pluginConfig", value: readInteger(pluginConfig.bridge?.historyPendingTimeoutMs) },
    ], { source: "default", value: DEFAULT_HISTORY_PENDING_TIMEOUT_MS });
    const bridgeHistoryPendingTimeoutMs = Math.max(0, bridgeHistoryPendingTimeoutMsPick.value);
    const shellEnabledPick = pickRequired([
        { source: "localConfig", value: readBoolean(localConfig.bridge?.shell?.enabled) },
        { source: "pluginConfig", value: readBoolean(pluginConfig.bridge?.shell?.enabled) },
    ], { source: "default", value: DEFAULT_SHELL_ENABLED });
    const shellMaxConcurrentSessionsPick = pickRequired([
        { source: "localConfig", value: readInteger(localConfig.bridge?.shell?.maxConcurrentSessions) },
        { source: "pluginConfig", value: readInteger(pluginConfig.bridge?.shell?.maxConcurrentSessions) },
    ], { source: "default", value: DEFAULT_SHELL_MAX_CONCURRENT_SESSIONS });
    const shellIdleTimeoutMsPick = pickRequired([
        { source: "localConfig", value: readInteger(localConfig.bridge?.shell?.idleTimeoutMs) },
        { source: "pluginConfig", value: readInteger(pluginConfig.bridge?.shell?.idleTimeoutMs) },
    ], { source: "default", value: DEFAULT_SHELL_IDLE_TIMEOUT_MS });
    const shellMaxDurationMsPick = pickRequired([
        { source: "localConfig", value: readInteger(localConfig.bridge?.shell?.maxDurationMs) },
        { source: "pluginConfig", value: readInteger(pluginConfig.bridge?.shell?.maxDurationMs) },
    ], { source: "default", value: DEFAULT_SHELL_MAX_DURATION_MS });
    const shellDefaultShellPick = pickRequired([
        { source: "localConfig", value: readString(localConfig.bridge?.shell?.defaultShell) },
        { source: "pluginConfig", value: readString(pluginConfig.bridge?.shell?.defaultShell) },
    ], { source: "default", value: DEFAULT_SHELL_DEFAULT_SHELL });
    const gatewayUrlPick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_GATEWAY_URL) },
        { source: "localConfig", value: readString(localConfig.gateway?.url) },
        { source: "pluginConfig", value: readString(pluginConfig.gateway?.url) },
    ], { source: "default", value: DEFAULT_GATEWAY_URL });
    const gatewayTokenPick = pickOptional([
        // Intentionally ignore process env token values here.
        // The runtime process can inherit stale service env tokens, so gateway token
        // resolution must stay anchored to OpenClaw/local/plugin config sources.
        { source: "openclawConfig", value: readString(openclawConfig?.gateway?.auth?.token) },
        { source: "localConfig", value: readString(localConfig.gateway?.token) },
        { source: "pluginConfig", value: readString(pluginConfig.gateway?.token) },
    ]);
    const gatewayProtocolPick = pickTruthyNumber([
        { source: "localConfig", value: readNumber(localConfig.gateway?.protocol) },
        { source: "pluginConfig", value: readNumber(pluginConfig.gateway?.protocol) },
    ], { source: "default", value: DEFAULT_PROTOCOL });
    const gatewayClientIdPick = pickRequired([
        { source: "localConfig", value: readString(localConfig.gateway?.clientId) },
        { source: "pluginConfig", value: readString(pluginConfig.gateway?.clientId) },
    ], { source: "default", value: DEFAULT_CLIENT_ID });
    const gatewayClientModePick = pickRequired([
        { source: "localConfig", value: readString(localConfig.gateway?.clientMode) },
        { source: "pluginConfig", value: readString(pluginConfig.gateway?.clientMode) },
    ], { source: "default", value: DEFAULT_CLIENT_MODE });
    const gatewayAgentIdPick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_GATEWAY_AGENT_ID) },
        { source: "localConfig", value: readString(localConfig.gateway?.agentId) },
        { source: "pluginConfig", value: readString(pluginConfig.gateway?.agentId) },
    ], { source: "default", value: DEFAULT_AGENT_ID });
    const retryBaseMsPick = pickRequired([
        { source: "localConfig", value: readNumber(localConfig.retry?.baseMs) },
        { source: "pluginConfig", value: readNumber(pluginConfig.retry?.baseMs) },
    ], { source: "default", value: DEFAULT_RETRY_BASE_MS });
    const retryMaxMsPick = pickRequired([
        { source: "localConfig", value: readNumber(localConfig.retry?.maxMs) },
        { source: "pluginConfig", value: readNumber(pluginConfig.retry?.maxMs) },
    ], { source: "default", value: DEFAULT_RETRY_MAX_MS });
    const retryMaxAttemptsPick = pickRequired([
        { source: "localConfig", value: readNumber(localConfig.retry?.maxAttempts) },
        { source: "pluginConfig", value: readNumber(pluginConfig.retry?.maxAttempts) },
    ], { source: "default", value: DEFAULT_RETRY_MAX_ATTEMPTS });
    const verboseLogPick = pickRequired([
        { source: "localConfig", value: readBoolean(localConfig.log?.verbose) },
        { source: "pluginConfig", value: readBoolean(pluginConfig.log?.verbose) },
    ], { source: "default", value: DEFAULT_VERBOSE_LOG });
    const logEnabledPick = pickRequired([
        // Keep log.enabled aligned with persisted config and installer flags; avoid process-env drift.
        { source: "localConfig", value: readBoolean(localConfig.log?.enabled) },
        { source: "pluginConfig", value: readBoolean(pluginConfig.log?.enabled) },
    ], { source: "default", value: DEFAULT_LOG_ENABLED });
    const forwardLogFilePick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_FORWARD_LOG_FILE) },
        { source: "localConfig", value: readString(localConfig.log?.forwardFile) },
        { source: "pluginConfig", value: readString(pluginConfig.log?.forwardFile) },
    ], { source: "default", value: DEFAULT_FORWARD_LOG_FILE });
    const replyLogFilePick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_REPLY_LOG_FILE) },
        { source: "localConfig", value: readString(localConfig.log?.replyFile) },
        { source: "pluginConfig", value: readString(pluginConfig.log?.replyFile) },
    ], { source: "default", value: DEFAULT_REPLY_LOG_FILE });
    const allLogFilePick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_ALL_LOG_FILE) },
        { source: "localConfig", value: readString(localConfig.log?.allFile) },
        { source: "pluginConfig", value: readString(pluginConfig.log?.allFile) },
    ], { source: "default", value: DEFAULT_ALL_LOG_FILE });
    const traceRequestIdFilterPick = pickOptional([
        { source: "env", value: readString(env.OPENCLAW_TRACE_REQUEST_ID_FILTER) },
        { source: "env", value: readString(env.OPENCLAW_TRACE_REQUEST_ID) },
        { source: "localConfig", value: readString(localConfig.log?.requestIdFilter) },
        { source: "pluginConfig", value: readString(pluginConfig.log?.requestIdFilter) },
    ]);
    const traceSessionIdFilterPick = pickOptional([
        { source: "env", value: readString(env.OPENCLAW_TRACE_SESSION_ID_FILTER) },
        { source: "env", value: readString(env.OPENCLAW_TRACE_SESSION_ID) },
        { source: "localConfig", value: readString(localConfig.log?.sessionIdFilter) },
        { source: "pluginConfig", value: readString(pluginConfig.log?.sessionIdFilter) },
    ]);
    const terminalPayloadModePick = pickRequired([
        { source: "env", value: normalizeTerminalPayloadMode(env.OPENCLAW_TERMINAL_PAYLOAD_MODE) },
        { source: "localConfig", value: normalizeTerminalPayloadMode(localConfig.log?.terminalPayloadMode) },
        { source: "pluginConfig", value: normalizeTerminalPayloadMode(pluginConfig.log?.terminalPayloadMode) },
    ], { source: "default", value: DEFAULT_TERMINAL_PAYLOAD_MODE });
    const terminalArtifactDirPick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_TERMINAL_ARTIFACT_DIR) },
        { source: "localConfig", value: readString(localConfig.log?.terminalArtifactDir) },
        { source: "pluginConfig", value: readString(pluginConfig.log?.terminalArtifactDir) },
    ], { source: "default", value: DEFAULT_TERMINAL_ARTIFACT_DIR });
    const defaultModelEnabledPick = pickRequired([
        { source: "env", value: readBooleanLike(env.OPENCLAW_DEFAULT_MODEL_ENABLED) },
        { source: "localConfig", value: readBoolean(localConfig.defaultModel?.enabled) },
        { source: "pluginConfig", value: readBoolean(pluginConfig.defaultModel?.enabled) },
    ], { source: "default", value: DEFAULT_MODEL_ENABLED });
    const defaultModelApiKeyPick = pickOptional([
        {
            source: "env",
            value: readString(env.OPENCLAW_DEFAULT_MODEL_API_KEY) ??
                readString(env.KIMI_API_KEY) ??
                readString(env.KIMICODE_API_KEY) ??
                readString(env.MOONSHOT_API_KEY),
        },
        { source: "localConfig", value: readString(localConfig.defaultModel?.apiKey) ?? readString(localConfig.bridge?.kimiCodeAPIKey) },
        { source: "pluginConfig", value: readString(pluginConfig.defaultModel?.apiKey) },
    ]);
    const defaultModelProviderPick = pickRequired([
        { source: "localConfig", value: readString(localConfig.defaultModel?.provider) },
        { source: "pluginConfig", value: readString(pluginConfig.defaultModel?.provider) },
    ], { source: "default", value: DEFAULT_MODEL_PROVIDER });
    const defaultModelIdPick = pickRequired([
        { source: "localConfig", value: readString(localConfig.defaultModel?.modelId) },
        { source: "pluginConfig", value: readString(pluginConfig.defaultModel?.modelId) },
    ], { source: "default", value: DEFAULT_MODEL_ID });
    const defaultModelBaseUrlPick = pickRequired([
        { source: "env", value: readString(env.OPENCLAW_DEFAULT_MODEL_BASE_URL) },
        {
            source: "localConfig",
            value: readString(localConfig.defaultModel?.baseUrl) ?? readString(localConfig.bridge?.kimiCodeBaseURL),
        },
        {
            source: "pluginConfig",
            value: readString(pluginConfig.defaultModel?.baseUrl) ?? readString(pluginConfig.bridge?.kimiCodeBaseURL),
        },
    ], { source: "default", value: DEFAULT_MODEL_BASE_URL });
    const config = {
        bridge: {
            url: bridgeUrlPick.value,
            userId: bridgeUserIdPick.value,
            token: bridgeTokenPick.value,
            kimiapiHost: bridgeKimiapiHostPick.value,
            kimiFileDownloadDir: bridgeKimiFileDownloadDirPick.value,
            protocol: bridgeProtocolPick.value,
            mode: bridgeModePick.value,
            instanceId: bridgeInstanceIdPick.value,
            deviceId: bridgeDeviceIdPick.value,
            forwardThinking: bridgeForwardThinkingPick.value,
            forwardToolCalls: bridgeForwardToolCallsPick.value,
            promptTimeoutMs: bridgePromptTimeoutMs,
            historyPendingTimeoutMs: bridgeHistoryPendingTimeoutMs,
            shell: {
                enabled: shellEnabledPick.value,
                maxConcurrentSessions: Math.max(1, shellMaxConcurrentSessionsPick.value),
                idleTimeoutMs: Math.max(0, shellIdleTimeoutMsPick.value),
                maxDurationMs: Math.max(0, shellMaxDurationMsPick.value),
                defaultShell: shellDefaultShellPick.value,
            },
        },
        gateway: {
            url: gatewayUrlPick.value,
            token: gatewayTokenPick.value,
            protocol: gatewayProtocolPick.value,
            clientId: gatewayClientIdPick.value,
            clientMode: gatewayClientModePick.value,
            agentId: gatewayAgentIdPick.value,
        },
        retry: {
            baseMs: retryBaseMsPick.value,
            maxMs: retryMaxMsPick.value,
            maxAttempts: retryMaxAttemptsPick.value,
        },
        log: {
            enabled: logEnabledPick.value,
            verbose: verboseLogPick.value,
            forwardFile: forwardLogFilePick.value,
            replyFile: replyLogFilePick.value,
            allFile: allLogFilePick.value,
            requestIdFilter: traceRequestIdFilterPick.value,
            sessionIdFilter: traceSessionIdFilterPick.value,
            terminalPayloadMode: terminalPayloadModePick.value,
            terminalArtifactDir: terminalArtifactDirPick.value,
        },
        defaultModel: {
            enabled: defaultModelEnabledPick.value,
            provider: defaultModelProviderPick.value,
            modelId: defaultModelIdPick.value,
            apiKey: defaultModelApiKeyPick.value,
            baseUrl: defaultModelBaseUrlPick.value,
        },
    };
    const sources = {
        bridge: {
            url: bridgeUrlPick.source,
            userId: bridgeUserIdPick.source,
            token: bridgeTokenPick.source,
            kimiapiHost: bridgeKimiapiHostPick.source,
            kimiFileDownloadDir: bridgeKimiFileDownloadDirPick.source,
            protocol: bridgeProtocolPick.source,
            mode: bridgeModePick.source,
            instanceId: bridgeInstanceIdPick.source,
            deviceId: bridgeDeviceIdPick.source,
            forwardThinking: bridgeForwardThinkingPick.source,
            forwardToolCalls: bridgeForwardToolCallsPick.source,
            promptTimeoutMs: bridgePromptTimeoutMsPick.source,
            historyPendingTimeoutMs: bridgeHistoryPendingTimeoutMsPick.source,
            shell: {
                enabled: shellEnabledPick.source,
                maxConcurrentSessions: shellMaxConcurrentSessionsPick.source,
                idleTimeoutMs: shellIdleTimeoutMsPick.source,
                maxDurationMs: shellMaxDurationMsPick.source,
                defaultShell: shellDefaultShellPick.source,
            },
        },
        gateway: {
            url: gatewayUrlPick.source,
            token: gatewayTokenPick.source,
            protocol: gatewayProtocolPick.source,
            clientId: gatewayClientIdPick.source,
            clientMode: gatewayClientModePick.source,
            agentId: gatewayAgentIdPick.source,
        },
        retry: {
            baseMs: retryBaseMsPick.source,
            maxMs: retryMaxMsPick.source,
            maxAttempts: retryMaxAttemptsPick.source,
        },
        log: {
            enabled: logEnabledPick.source,
            verbose: verboseLogPick.source,
            forwardFile: forwardLogFilePick.source,
            replyFile: replyLogFilePick.source,
            allFile: allLogFilePick.source,
            requestIdFilter: traceRequestIdFilterPick.source,
            sessionIdFilter: traceSessionIdFilterPick.source,
            terminalPayloadMode: terminalPayloadModePick.source,
            terminalArtifactDir: terminalArtifactDirPick.source,
        },
        defaultModel: {
            enabled: defaultModelEnabledPick.source,
            provider: defaultModelProviderPick.source,
            modelId: defaultModelIdPick.source,
            apiKey: defaultModelApiKeyPick.source,
            baseUrl: defaultModelBaseUrlPick.source,
        },
    };
    return {
        config,
        sources,
        validation: validateResolvedConfig({ config, localConfigPath }),
        localConfigPath,
    };
}
export function resolveConnectorConfig(params) {
    return resolveConnectorConfigWithMeta(params).config;
}
