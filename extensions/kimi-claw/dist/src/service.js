import path from "node:path";
import { mirrorOpenClawConfigToLocalDir, resolveConnectorConfigWithMeta, syncKimiPluginApiKeyFromKimiCodeApiKeyInLocalConfig, } from "./config.js";
import { createObsEventWriter } from "./observability.js";
import { resolvePluginVersion } from "./plugin-version.js";
import { buildLogger } from "./service/logger.js";
import { createAcpModeClients } from "./service/mode-acp.js";
import { createBridgeModeClients } from "./service/mode-bridge.js";
import { detachManualReconnectSignal, MANUAL_RECONNECT_SIGNAL, registerManualReconnectSignal, } from "./service/reconnect-signal.js";
import { buildAllTrace, buildForwardTrace, buildReplyTrace } from "./service/trace.js";
import { normalizeTraceFilter } from "./trace-utils.js";
const CONNECT_VERSION = resolvePluginVersion();
const KIMI_CODING_BASE_URL = "https://api.kimi.com/coding";
const KIMI_PROVIDER_HEADER_NAME = "User-Agent";
const KIMI_PROVIDER_HEADER_VALUE = "Kimi Claw Plugin";
const KIMI_DEFAULT_ALIAS = "Kimi K2.5";
function hasKimiSearchInstalled(openclawConfig) {
    if (!openclawConfig || typeof openclawConfig !== "object" || Array.isArray(openclawConfig)) {
        return false;
    }
    const root = openclawConfig;
    const plugins = root.plugins && typeof root.plugins === "object" && !Array.isArray(root.plugins)
        ? root.plugins
        : null;
    if (!plugins) {
        return false;
    }
    const entries = plugins.entries && typeof plugins.entries === "object" && !Array.isArray(plugins.entries)
        ? plugins.entries
        : null;
    if (!entries) {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(entries, "kimi-search");
}
function isDefaultModelAlreadyConfigured(config, dm) {
    const modelRef = `${dm.provider}/${dm.modelId}`;
    // Check agents.defaults.model.primary
    const agents = config.agents;
    const defaults = agents?.defaults;
    const model = defaults?.model;
    if (model?.primary !== modelRef)
        return false;
    // Check env.KIMI_API_KEY
    const env = config.env;
    if (env?.KIMI_API_KEY !== dm.apiKey)
        return false;
    // Check models.providers.<provider>
    const models = config.models;
    const providers = models?.providers;
    const provider = providers?.[dm.provider];
    if (!provider)
        return false;
    if (provider.baseUrl !== dm.baseUrl)
        return false;
    if (provider.apiKey !== dm.apiKey)
        return false;
    if (provider.api !== "anthropic-messages")
        return false;
    const providerHeaders = provider.headers;
    if (providerHeaders?.[KIMI_PROVIDER_HEADER_NAME] !== KIMI_PROVIDER_HEADER_VALUE)
        return false;
    const providerModels = provider.models;
    if (!providerModels || providerModels.length === 0)
        return false;
    const modelEntry = providerModels.find((entry) => entry?.id === dm.modelId);
    if (!modelEntry)
        return false;
    const modelHeaders = modelEntry.headers;
    if (modelHeaders?.[KIMI_PROVIDER_HEADER_NAME] !== KIMI_PROVIDER_HEADER_VALUE)
        return false;
    return true;
}
async function applyDefaultModelConfig(params) {
    if (!params.defaultModel.enabled) {
        return;
    }
    if (!params.defaultModel.apiKey) {
        params.logger.warn("[defaultModel] enabled but apiKey missing; skip");
        return;
    }
    const config = params.runtime.config.loadConfig();
    // Skip write if the model is already correctly configured to avoid
    // triggering gateway's config-change watcher and causing a restart loop.
    if (isDefaultModelAlreadyConfigured(config, {
        provider: params.defaultModel.provider,
        modelId: params.defaultModel.modelId,
        apiKey: params.defaultModel.apiKey,
        baseUrl: params.defaultModel.baseUrl,
    })) {
        const modelRef = `${params.defaultModel.provider}/${params.defaultModel.modelId}`;
        params.logger.info(`[defaultModel] ${modelRef} already configured; skip write`);
        return;
    }
    if (!config.models)
        config.models = {};
    const models = config.models;
    if (models.mode === undefined) {
        models.mode = "merge";
    }
    if (!models.providers)
        models.providers = {};
    const providers = models.providers;
    const providerBaseUrl = params.defaultModel.baseUrl || KIMI_CODING_BASE_URL;
    providers[params.defaultModel.provider] = {
        baseUrl: providerBaseUrl,
        apiKey: params.defaultModel.apiKey,
        api: "anthropic-messages",
        headers: {
            [KIMI_PROVIDER_HEADER_NAME]: KIMI_PROVIDER_HEADER_VALUE,
        },
        models: [
            {
                id: params.defaultModel.modelId,
                name: params.defaultModel.modelId,
                headers: {
                    [KIMI_PROVIDER_HEADER_NAME]: KIMI_PROVIDER_HEADER_VALUE,
                },
                contextWindow: 262144,
                maxTokens: 32768,
            },
        ],
    };
    const modelRef = `${params.defaultModel.provider}/${params.defaultModel.modelId}`;
    if (!config.env)
        config.env = {};
    const env = config.env;
    env.KIMI_API_KEY = params.defaultModel.apiKey;
    if (!config.agents)
        config.agents = {};
    const agents = config.agents;
    if (!agents.defaults)
        agents.defaults = {};
    const defaults = agents.defaults;
    if (!defaults.model)
        defaults.model = {};
    const model = defaults.model;
    model.primary = modelRef;
    if (!defaults.models)
        defaults.models = {};
    const modelMap = defaults.models;
    const modelEntry = modelMap[modelRef] && typeof modelMap[modelRef] === "object" && !Array.isArray(modelMap[modelRef])
        ? modelMap[modelRef]
        : {};
    if (typeof modelEntry.alias !== "string" || !modelEntry.alias.trim()) {
        modelEntry.alias = KIMI_DEFAULT_ALIAS;
    }
    modelMap[modelRef] = modelEntry;
    await params.runtime.config.writeConfigFile(config);
    params.logger.info(`[defaultModel] configured ${modelRef} as default`);
}
export function createConnectorService(params) {
    let bridgeClient = null;
    let gatewayClient = null;
    const reconnectSignalState = { handler: null };
    let stopped = true;
    const stop = () => {
        stopped = true;
        detachManualReconnectSignal(reconnectSignalState);
        bridgeClient?.stop();
        gatewayClient?.stop();
        bridgeClient = null;
        gatewayClient = null;
    };
    const start = (ctx) => {
        stop();
        stopped = false;
        const resolvedConfig = resolveConnectorConfigWithMeta({
            pluginConfig: params.pluginConfig,
            openclawConfig: ctx.config,
            env: process.env,
        });
        const cfg = resolvedConfig.config;
        const logger = buildLogger(params.logger, cfg.log.verbose);
        const shouldSyncSearchApiKey = cfg.defaultModel.enabled && hasKimiSearchInstalled(ctx.config);
        if (shouldSyncSearchApiKey) {
            const syncResult = syncKimiPluginApiKeyFromKimiCodeApiKeyInLocalConfig();
            if (syncResult.updated) {
                logger.info(`[config] synced bridge.kimiPluginAPIKey from bridge.kimiCodeAPIKey (${syncResult.configPath})`);
            }
            else if (syncResult.reason === "write_failed") {
                logger.warn(`[config] failed to sync bridge.kimiPluginAPIKey (${syncResult.configPath}): ${syncResult.error ?? "unknown error"}`);
            }
            else {
                logger.debug(`[config] skip bridge.kimiPluginAPIKey sync (${syncResult.configPath}): ${syncResult.reason ?? "not_required"}`);
            }
        }
        const mirrorResult = mirrorOpenClawConfigToLocalDir({
            env: process.env,
        });
        if (mirrorResult.copied) {
            logger.info(`[config] mirrored openclaw config ${mirrorResult.sourcePath} -> ${mirrorResult.destinationPath}`);
        }
        else if (mirrorResult.reason === "source_missing") {
            logger.debug(`[config] openclaw config not found at ${mirrorResult.sourcePath}; skip mirror`);
        }
        else if (mirrorResult.reason === "same_path") {
            logger.debug(`[config] openclaw config mirror skipped; source already in local config directory`);
        }
        else {
            logger.warn(`[config] openclaw config mirror failed ${mirrorResult.sourcePath} -> ${mirrorResult.destinationPath}: ${mirrorResult.error ?? "unknown error"}`);
        }
        applyDefaultModelConfig({
            runtime: params.runtime,
            defaultModel: cfg.defaultModel,
            logger,
        }).catch((err) => {
            logger.warn(`[defaultModel] failed to apply default model config: ${err instanceof Error ? err.message : String(err)}`);
        });
        const traceFilter = normalizeTraceFilter({
            requestId: cfg.log.requestIdFilter,
            sessionId: cfg.log.sessionIdFilter,
        });
        const traceSanitizeOptions = {
            terminalPayloadMode: cfg.log.terminalPayloadMode,
            terminalArtifactDir: cfg.log.terminalArtifactDir,
        };
        const traceAll = cfg.log.enabled
            ? buildAllTrace(cfg.log.allFile, logger, traceFilter)
            : (_row) => undefined;
        const traceForward = cfg.log.enabled
            ? (() => {
                const allTracePath = path.resolve(cfg.log.allFile);
                const shouldMirrorForward = path.resolve(cfg.log.forwardFile) !== allTracePath;
                return buildForwardTrace(cfg.log.forwardFile, logger, traceFilter, shouldMirrorForward ? traceAll : undefined, traceSanitizeOptions);
            })()
            : (_link, _payload) => undefined;
        const traceReply = cfg.log.enabled
            ? (() => {
                const allTracePath = path.resolve(cfg.log.allFile);
                const shouldMirrorReply = path.resolve(cfg.log.replyFile) !== allTracePath;
                return buildReplyTrace(cfg.log.replyFile, logger, traceFilter, shouldMirrorReply ? traceAll : undefined, traceSanitizeOptions);
            })()
            : (_stage, _payload) => undefined;
        if (cfg.log.enabled) {
            logger.info(`[trace] all trace file=${cfg.log.allFile}`);
            logger.info(`[trace] forward trace file=${cfg.log.forwardFile}`);
            logger.info(`[trace] reply trace file=${cfg.log.replyFile}`);
            if (traceFilter.requestId || traceFilter.sessionId) {
                logger.info(`[trace] filter requestId=${traceFilter.requestId ?? "*"} sessionId=${traceFilter.sessionId ?? "*"}`);
            }
        }
        else {
            logger.info("[trace] file logging disabled (log.enabled=false)");
        }
        const writeObsEvent = cfg.log.enabled
            ? createObsEventWriter({
                filePath: cfg.log.allFile,
                logger,
                redaction: {
                    bridgeToken: cfg.bridge.token,
                    gatewayToken: cfg.gateway.token,
                },
            })
            : () => undefined;
        writeObsEvent({
            component: "connector",
            domain: "lifecycle",
            name: "lifecycle.startup",
            severity: "info",
            payload: {
                pluginVersion: CONNECT_VERSION,
                pid: process.pid,
                nodeVersion: process.version,
                cwd: process.cwd(),
                traceFiles: {
                    forward: path.resolve(cfg.log.forwardFile),
                    reply: path.resolve(cfg.log.replyFile),
                    all: path.resolve(cfg.log.allFile),
                },
            },
        });
        writeObsEvent({
            component: "connector",
            domain: "config",
            name: "config.resolved",
            severity: "info",
            payload: {
                config: cfg,
                sources: resolvedConfig.sources,
                localConfigPath: resolvedConfig.localConfigPath,
            },
        });
        for (const issue of resolvedConfig.validation) {
            writeObsEvent({
                component: "connector",
                domain: "config",
                name: "config.validation",
                severity: issue.severity === "error" ? "error" : "warn",
                summary: issue.message,
                error: {
                    code: issue.code,
                    message: issue.message,
                    nextSteps: issue.nextSteps,
                },
            });
        }
        const fatalConfigError = resolvedConfig.validation.find((issue) => issue.code === "CONFIG_BRIDGE_USER_ID_MISSING");
        if (fatalConfigError) {
            logger.error("bridge.userId missing; set plugins.entries.kimi-claw.config.bridge.userId or OPENCLAW_BRIDGE_USER_ID");
            return;
        }
        if (cfg.bridge.mode === "acp") {
            const modeClients = createAcpModeClients({
                cfg,
                logger,
                connectVersion: CONNECT_VERSION,
                traceForward,
                traceReply,
                traceAll,
                writeObsEvent,
                isStopped: () => stopped,
            });
            bridgeClient = modeClients.bridgeClient;
            gatewayClient = modeClients.gatewayClient;
        }
        else {
            const modeClients = createBridgeModeClients({
                cfg,
                logger,
                connectVersion: CONNECT_VERSION,
                traceForward,
                writeObsEvent,
            });
            bridgeClient = modeClients.bridgeClient;
            gatewayClient = modeClients.gatewayClient;
        }
        const reconnectNow = () => {
            if (stopped) {
                return;
            }
            logger.warn(`manual reconnect signal received signal=${MANUAL_RECONNECT_SIGNAL}`);
            bridgeClient?.stop();
            gatewayClient?.stop();
            bridgeClient?.start();
            gatewayClient?.start();
        };
        registerManualReconnectSignal({
            state: reconnectSignalState,
            logger,
            onReconnect: reconnectNow,
        });
        bridgeClient.start();
        gatewayClient?.start();
    };
    return {
        start,
        stop,
        get stopped() {
            return stopped;
        },
    };
}
