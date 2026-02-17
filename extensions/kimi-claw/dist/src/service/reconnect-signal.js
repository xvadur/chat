export const MANUAL_RECONNECT_SIGNAL = "SIGUSR1";
export const detachManualReconnectSignal = (state, runtime = process) => {
    if (!state.handler) {
        return;
    }
    try {
        runtime.off(MANUAL_RECONNECT_SIGNAL, state.handler);
    }
    catch {
        // ignore unsupported signal/runtime
    }
    state.handler = null;
};
export const registerManualReconnectSignal = (params) => {
    const runtime = params.runtime ?? process;
    detachManualReconnectSignal(params.state, runtime);
    params.state.handler = params.onReconnect;
    try {
        runtime.on(MANUAL_RECONNECT_SIGNAL, params.onReconnect);
        params.logger.info(`manual reconnect enabled signal=${MANUAL_RECONNECT_SIGNAL}`);
    }
    catch {
        params.logger.warn("manual reconnect signal not supported in current runtime");
    }
};
