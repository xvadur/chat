import { AcpGatewayBridge } from "../acp-gateway-bridge.js";
import { JsonRpcWsClient } from "../jsonrpc-ws-client.js";
import { buildDeviceAuthField, loadOrCreateDeviceIdentity } from "../utils/device-identity.js";
import { isRecord } from "../utils/json.js";
import { HandshakeWsClient } from "../ws-client.js";
const defaultJsonRpcClientFactory = (options) => new JsonRpcWsClient(options);
const defaultHandshakeClientFactory = (options) => new HandshakeWsClient(options);
const defaultAcpGatewayBridgeFactory = (options) => new AcpGatewayBridge(options);
const KIMI_CLAW_VERSION_HEADER = "X-Kimi-Claw-Version";
const buildGatewayConnectFrame = (cfg, connectVersion, nonce) => {
    const role = "operator";
    const scopes = ["operator.admin"];
    const connectParams = {
        minProtocol: cfg.gateway.protocol,
        maxProtocol: cfg.gateway.protocol,
        client: {
            id: cfg.gateway.clientId,
            version: connectVersion,
            platform: process.platform,
            mode: cfg.gateway.clientMode,
            displayName: "kimi-bridge-connector",
        },
        role,
        scopes,
        caps: ["tool-events"],
    };
    if (cfg.gateway.token) {
        connectParams.auth = { token: cfg.gateway.token };
    }
    const identity = loadOrCreateDeviceIdentity();
    connectParams.device = buildDeviceAuthField({
        identity,
        clientId: cfg.gateway.clientId,
        clientMode: cfg.gateway.clientMode,
        role,
        scopes,
        token: cfg.gateway.token,
        nonce,
    });
    return {
        type: "req",
        id: "connect",
        method: "connect",
        params: connectParams,
    };
};
export const createAcpModeClients = (params) => {
    const createJsonRpcClient = params.createJsonRpcClient ?? defaultJsonRpcClientFactory;
    const createHandshakeClient = params.createHandshakeClient ?? defaultHandshakeClientFactory;
    const createAcpGatewayBridge = params.createAcpGatewayBridge ?? defaultAcpGatewayBridgeFactory;
    const { cfg, logger } = params;
    const versionHeaders = {
        [KIMI_CLAW_VERSION_HEADER]: params.connectVersion,
    };
    logger.info("[acp] mode=acp using direct gateway adapter path (no subprocess)");
    logger.info(`[acp] prompt timeout fallback=${cfg.bridge.promptTimeoutMs}ms`);
    let bridgeClient = null;
    let gatewayClient = null;
    const sendToBridge = (payload) => {
        if (!bridgeClient || !bridgeClient.isReady()) {
            return false;
        }
        params.traceForward("plugin->bridge_ws", payload);
        if (isRecord(payload)) {
            params.traceReply("plugin->bridge_ws", payload);
        }
        return bridgeClient.send(payload);
    };
    const acpGatewayBridge = createAcpGatewayBridge({
        logger,
        instanceMeta: {
            instanceId: cfg.bridge.instanceId,
            deviceId: cfg.bridge.deviceId,
            pluginVersion: params.connectVersion,
        },
        agentId: cfg.gateway.agentId,
        isGatewayReady: () => !!gatewayClient?.isReady(),
        sendBridgeMessage: (message) => {
            if (!sendToBridge(message)) {
                logger.warn("bridge ACP disconnected; dropping adapter message");
            }
        },
        sendGatewayFrame: (frame) => {
            params.traceForward("plugin->openclaw_gateway", frame);
            return gatewayClient?.send(frame) ?? false;
        },
        writeObsEvent: params.writeObsEvent,
        forceRealtimeVerbose: true,
        forceReasoningStream: true,
        forwardThinkingToBridge: cfg.bridge.forwardThinking,
        forwardToolCallsToBridge: cfg.bridge.forwardToolCalls,
        promptTimeoutMs: cfg.bridge.promptTimeoutMs,
        historyPendingTimeoutMs: cfg.bridge.historyPendingTimeoutMs,
        kimiapiHost: cfg.bridge.kimiapiHost,
        kimiBotToken: cfg.bridge.token,
        kimiFileDownloadDir: cfg.bridge.kimiFileDownloadDir,
        traceAll: params.traceAll,
    });
    bridgeClient = createJsonRpcClient({
        name: "bridge-acp",
        url: cfg.bridge.url,
        headers: versionHeaders,
        token: cfg.bridge.token,
        logger,
        writeObsEvent: params.writeObsEvent,
        retry: cfg.retry,
        onMessage: (message) => {
            params.traceForward("bridge_ws->plugin", message);
            if (isRecord(message)) {
                params.traceReply("bridge_ws->plugin", message);
            }
            acpGatewayBridge.handleBridgeMessage(message);
        },
        onReady: () => {
            logger.info(`bridge ACP connected url=${cfg.bridge.url} instance_id=${cfg.bridge.instanceId} device_id=${cfg.bridge.deviceId}`);
        },
        onClose: () => {
            logger.warn("bridge ACP disconnected");
        },
    });
    gatewayClient = createHandshakeClient({
        name: "gateway",
        url: cfg.gateway.url,
        headers: versionHeaders,
        logger,
        writeObsEvent: params.writeObsEvent,
        obsHop: "gateway_ws",
        retry: cfg.retry,
        buildConnect: (nonce) => buildGatewayConnectFrame(cfg, params.connectVersion, nonce),
        onFrame: (frame) => {
            params.traceForward("openclaw_gateway->plugin", frame);
            acpGatewayBridge.handleGatewayFrame(frame);
        },
        onReady: () => {
            logger.info(`local gateway connected url=${cfg.gateway.url} (acp adapter mode)`);
        },
        onClose: () => {
            logger.warn("local gateway disconnected");
            if (!params.isStopped()) {
                acpGatewayBridge.handleGatewayDisconnected();
            }
        },
    });
    return {
        bridgeClient,
        gatewayClient,
    };
};
