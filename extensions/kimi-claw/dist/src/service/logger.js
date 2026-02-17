const LOG_PREFIX = "[kimi-bridge]";
export const buildLogger = (logger, verbose) => {
    const debug = (message) => {
        if (!verbose) {
            return;
        }
        if (logger.debug) {
            logger.debug(`${LOG_PREFIX} ${message}`);
            return;
        }
        logger.info(`${LOG_PREFIX} ${message}`);
    };
    return {
        info: (message) => logger.info(`${LOG_PREFIX} ${message}`),
        warn: (message) => logger.warn(`${LOG_PREFIX} ${message}`),
        error: (message) => logger.error(`${LOG_PREFIX} ${message}`),
        debug,
    };
};
