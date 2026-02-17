import { asTrimmedNonEmptyString } from "./text.js";
export const isRecord = (value) => typeof value === "object" && value !== null;
export const isPlainRecord = (value) => isRecord(value) && !Array.isArray(value);
export const asRpcId = (value) => {
    const normalized = asTrimmedNonEmptyString(value);
    if (normalized) {
        return normalized;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return undefined;
};
