import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { asTrimmedNonEmptyString } from "./utils/text.js";
const DEFAULT_PLUGIN_VERSION = "0.1.0";
const readVersionFromJsonFile = (fileUrl) => {
    try {
        const raw = readFileSync(fileURLToPath(fileUrl), "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return undefined;
        }
        return asTrimmedNonEmptyString(parsed.version);
    }
    catch {
        return undefined;
    }
};
export const resolvePluginVersion = () => {
    const candidates = [
        new URL("../openclaw.plugin.json", import.meta.url),
        new URL("../../openclaw.plugin.json", import.meta.url),
        new URL("../package.json", import.meta.url),
        new URL("../../package.json", import.meta.url),
    ];
    for (const candidate of candidates) {
        const version = readVersionFromJsonFile(candidate);
        if (version) {
            return version;
        }
    }
    return DEFAULT_PLUGIN_VERSION;
};
