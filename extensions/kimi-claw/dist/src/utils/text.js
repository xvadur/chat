import { stripTransportMetadata } from "../message-filter.js";
export const asTrimmedNonEmptyString = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
export const asNonEmptyTextChunk = (value) => typeof value === "string" && value.length > 0 ? value : undefined;
export const normalizeTransportText = (value) => {
    if (typeof value !== "string" || value.length === 0) {
        return undefined;
    }
    const cleaned = stripTransportMetadata(value);
    return cleaned.length > 0 ? cleaned : undefined;
};
