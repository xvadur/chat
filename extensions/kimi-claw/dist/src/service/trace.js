import { buildStructuredTraceFields, rowMatchesTraceFilter, sanitizeTracePayloadForLogging, } from "../trace-utils.js";
import { isRecord } from "../utils/json.js";
import { createRollingJsonlWriter, DEFAULT_LOG_ROLLING_MAX_BYTES, } from "../utils/rolling-jsonl.js";
export const buildAllTrace = (filePath, logger, traceFilter) => {
    const target = filePath.trim();
    if (!target) {
        return (_row) => undefined;
    }
    const writeJsonlRow = createRollingJsonlWriter({
        filePath: target,
        logger,
        contextLabel: "trace",
        maxBytes: DEFAULT_LOG_ROLLING_MAX_BYTES,
    });
    return (row) => {
        if (!rowMatchesTraceFilter(row, traceFilter)) {
            return;
        }
        writeJsonlRow(row);
    };
};
export const buildForwardTrace = (filePath, logger, traceFilter, onRow, sanitizeOptions) => {
    const target = filePath.trim();
    if (!target) {
        return (_link, _payload) => undefined;
    }
    const writeJsonlRow = createRollingJsonlWriter({
        filePath: target,
        logger,
        contextLabel: "trace",
        maxBytes: DEFAULT_LOG_ROLLING_MAX_BYTES,
    });
    return (link, payload) => {
        const ts = new Date().toISOString();
        const structured = buildStructuredTraceFields(link, payload, ts);
        const baseRow = {
            ts,
            trace: "forward",
            link,
            ...structured,
        };
        if (!rowMatchesTraceFilter(baseRow, traceFilter)) {
            return;
        }
        const sanitizedPayload = sanitizeTracePayloadForLogging(payload, sanitizeOptions);
        const row = {
            ...baseRow,
            payload: sanitizedPayload,
        };
        writeJsonlRow(row);
        onRow?.(row);
    };
};
export const buildReplyTrace = (filePath, logger, traceFilter, onRow, sanitizeOptions) => {
    const target = filePath.trim();
    if (!target) {
        return (_stage, _payload) => undefined;
    }
    const writeJsonlRow = createRollingJsonlWriter({
        filePath: target,
        logger,
        contextLabel: "trace",
        maxBytes: DEFAULT_LOG_ROLLING_MAX_BYTES,
    });
    let seq = 0;
    return (stage, payload) => {
        seq += 1;
        const ts = new Date().toISOString();
        const structured = buildStructuredTraceFields(stage, payload, ts);
        const baseRow = {
            ts,
            trace: "reply",
            seq,
            stage,
            ...structured,
        };
        if (!rowMatchesTraceFilter(baseRow, traceFilter)) {
            return;
        }
        const sanitizedPayload = sanitizeTracePayloadForLogging(payload, sanitizeOptions);
        const row = {
            ...baseRow,
            ...(isRecord(sanitizedPayload) ? sanitizedPayload : { payload: sanitizedPayload }),
        };
        writeJsonlRow(row);
        onRow?.(row);
    };
};
