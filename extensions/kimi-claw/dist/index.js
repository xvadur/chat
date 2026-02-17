import { createConnectorService } from "./src/service.js";
const plugin = {
    id: "kimi-claw",
    name: "kimi-claw",
    description: "Connector plugin that bridges a remote /gateway server with the local OpenClaw Gateway.",
    register(api) {
        const service = createConnectorService({
            logger: api.logger,
            pluginConfig: api.pluginConfig ?? {},
            runtime: api.runtime,
        });
        api.registerService({
            id: "kimi-claw",
            start: (ctx) => service.start(ctx),
            stop: () => service.stop(),
        });
    },
};
export default plugin;
