import { buildDeviceAuthField, loadOrCreateDeviceIdentity } from "../utils/device-identity.js";
import { HandshakeWsClient } from "../ws-client.js";
const defaultHandshakeClientFactory = (options) => new HandshakeWsClient(options);
const KIMI_CLAW_VERSION_HEADER = "X-Kimi-Claw-Version";
const buildBridgeConnectFrame = (cfg, connectVersion) => {
    const connectParams = {
        minProtocol: cfg.bridge.protocol,
        maxProtocol: cfg.bridge.protocol,
        client: {
            id: `im:${cfg.bridge.userId}`,
            version: connectVersion,
            platform: process.platform,
            mode: "backend",
        },
        role: "operator",
        scopes: ["operator.read", "operator.write"],
        locale: "zh-CN",
        userAgent: "kimi-claw",
    };
    if (cfg.bridge.token) {
        connectParams.auth = { token: cfg.bridge.token };
    }
    return {
        type: "req",
        id: "connect",
        method: "connect",
        params: connectParams,
    };
};
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
const formatContext = (data) => {
    const parts = [];
    if (data.userId)
        parts.push(`user_id=${data.userId}`);
    if (data.requestId)
        parts.push(`request_id=${data.requestId}`);
    if (data.runId)
        parts.push(`run_id=${data.runId}`);
    return parts.length ? parts.join(" ") : "context=none";
};
export const createBridgeModeClients = (params) => {
    const createHandshakeClient = params.createHandshakeClient ?? defaultHandshakeClientFactory;
    const { cfg, logger } = params;
    const versionHeaders = {
        [KIMI_CLAW_VERSION_HEADER]: params.connectVersion,
    };
    let bridgeClient = null;
    let gatewayClient = null;
    const handleGatewayFrame = (frame) => {
        if (!bridgeClient || !bridgeClient.isReady()) {
            logger.debug?.("bridge not ready; dropping gateway frame");
            return;
        }
        if (frame.type === "event" && frame.event !== "agent") {
            return;
        }
        params.traceForward("openclaw_gateway->plugin", frame);
        params.traceForward("plugin->bridge_ws", frame);
        bridgeClient.send(frame);
    };
    const handleBridgeFrame = (frame) => {
        params.traceForward("bridge_ws->plugin", frame);
        if (frame.type !== "req") {
            logger.debug?.("ignoring non-req frame from bridge");
            return;
        }
        const requestId = frame.id;
        const ctxLabel = formatContext({ requestId, userId: cfg.bridge.userId });
        if (!gatewayClient || !gatewayClient.isReady()) {
            logger.warn(`gateway offline for ${ctxLabel}`);
            const errorRes = {
                type: "res",
                id: requestId,
                ok: false,
                error: {
                    code: "GATEWAY_OFFLINE",
                    message: "gateway offline",
                },
            };
            params.traceForward("plugin->bridge_ws", errorRes);
            bridgeClient?.send(errorRes);
            return;
        }
        params.traceForward("plugin->openclaw_gateway", frame);
        gatewayClient.send(frame);
        logger.debug?.(`bridge req forwarded ${ctxLabel}`);
    };
    bridgeClient = createHandshakeClient({
        name: "bridge",
        url: cfg.bridge.url,
        headers: versionHeaders,
        logger,
        retry: cfg.retry,
        buildConnect: () => buildBridgeConnectFrame(cfg, params.connectVersion),
        onFrame: handleBridgeFrame,
        onReady: () => {
            logger.info(`bridge connected url=${cfg.bridge.url} user_id=${cfg.bridge.userId}`);
        },
        onClose: () => {
            logger.warn(`bridge disconnected user_id=${cfg.bridge.userId}`);
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
        onFrame: handleGatewayFrame,
        onReady: () => {
            logger.info(`local gateway connected url=${cfg.gateway.url}`);
        },
        onClose: () => {
            logger.warn("local gateway disconnected");
        },
    });
    return {
        bridgeClient,
        gatewayClient,
    };
};
