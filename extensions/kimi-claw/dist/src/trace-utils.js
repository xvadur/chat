import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { asRpcId, isRecord } from "./utils/json.js";
import { asTrimmedNonEmptyString as asString } from "./utils/text.js";
const BASE64_PAYLOAD_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const readSessionIdentifiersFromRecord = (record) => {
    const directSessionId = asString(record.sessionId);
    const directSessionKey = asString(record.sessionKey);
    const meta = isRecord(record._meta) ? record._meta : undefined;
    const metaSessionId = meta ? asString(meta.sessionId) : undefined;
    const metaSessionKey = meta ? asString(meta.sessionKey) : undefined;
    const openclawMeta = meta && isRecord(meta.openclaw) ? meta.openclaw : undefined;
    const openclawSessionId = openclawMeta ? asString(openclawMeta.sessionId) : undefined;
    const openclawSessionKey = openclawMeta ? asString(openclawMeta.sessionKey) : undefined;
    return {
        sessionId: directSessionId ?? metaSessionId ?? openclawSessionId,
        sessionKey: directSessionKey ?? metaSessionKey ?? openclawSessionKey,
    };
};
const mergeSessionIdentifiers = (...sources) => {
    let sessionId;
    let sessionKey;
    for (const source of sources) {
        if (!isRecord(source)) {
            continue;
        }
        const found = readSessionIdentifiersFromRecord(source);
        if (!sessionId && found.sessionId) {
            sessionId = found.sessionId;
        }
        if (!sessionKey && found.sessionKey) {
            sessionKey = found.sessionKey;
        }
        if (sessionId && sessionKey) {
            break;
        }
    }
    return { sessionId, sessionKey };
};
const extractRequestId = (record) => {
    const params = isRecord(record.params) ? record.params : undefined;
    const payload = isRecord(record.payload) ? record.payload : undefined;
    const result = isRecord(record.result) ? record.result : undefined;
    const error = isRecord(record.error) ? record.error : undefined;
    const errorData = error && isRecord(error.data) ? error.data : undefined;
    const paramsMeta = params && isRecord(params._meta) ? params._meta : undefined;
    const resultMeta = result && isRecord(result._meta) ? result._meta : undefined;
    const errorDataMeta = errorData && isRecord(errorData._meta) ? errorData._meta : undefined;
    const payloadData = payload && isRecord(payload.data) ? payload.data : undefined;
    const candidates = [
        record.id,
        record.requestId,
        record.request_id,
        params?.requestId,
        params?.request_id,
        paramsMeta?.requestId,
        payload?.requestId,
        payload?.request_id,
        payloadData?.requestId,
        payloadData?.request_id,
        result?.requestId,
        resultMeta?.requestId,
        errorData?.requestId,
        errorData?.request_id,
        errorDataMeta?.requestId,
        errorDataMeta?.request_id,
    ];
    for (const candidate of candidates) {
        const normalized = asRpcId(candidate);
        if (normalized) {
            return normalized;
        }
    }
    return undefined;
};
const extractMethod = (record) => asString(record.method);
const extractEvent = (record) => {
    const directEvent = asString(record.event);
    if (directEvent) {
        return directEvent;
    }
    if (asString(record.method) === "terminal/update") {
        const params = isRecord(record.params) ? record.params : undefined;
        return params ? asString(params.event) : undefined;
    }
    return undefined;
};
const extractTerminalId = (record) => {
    const params = isRecord(record.params) ? record.params : undefined;
    const payload = isRecord(record.payload) ? record.payload : undefined;
    const payloadData = payload && isRecord(payload.data) ? payload.data : undefined;
    const result = isRecord(record.result) ? record.result : undefined;
    const error = isRecord(record.error) ? record.error : undefined;
    const errorData = error && isRecord(error.data) ? error.data : undefined;
    const candidates = [
        record.terminalId,
        params?.terminalId,
        payload?.terminalId,
        payloadData?.terminalId,
        result?.terminalId,
        errorData?.terminalId,
    ];
    for (const candidate of candidates) {
        const terminalId = asString(candidate);
        if (terminalId) {
            return terminalId;
        }
    }
    return undefined;
};
const extractTerminalEvent = (record) => {
    if (asString(record.method) === "terminal/update") {
        const params = isRecord(record.params) ? record.params : undefined;
        const event = params ? asString(params.event) : undefined;
        if (event) {
            return event;
        }
    }
    const frameType = asString(record.type);
    if (frameType === "event" && asString(record.event) === "agent") {
        const payload = isRecord(record.payload) ? record.payload : undefined;
        if (asString(payload?.stream) === "lifecycle") {
            const data = payload && isRecord(payload.data) ? payload.data : undefined;
            const phase = asString(data?.phase);
            if (phase === "end") {
                return "end_turn";
            }
            if (phase === "cancel" || phase === "cancelled") {
                return "cancelled";
            }
            if (phase === "error") {
                return "error";
            }
        }
    }
    if (Object.prototype.hasOwnProperty.call(record, "error") && record.error !== undefined) {
        return "error";
    }
    const result = isRecord(record.result) ? record.result : undefined;
    const stopReason = result ? asString(result.stopReason) : undefined;
    if (stopReason) {
        return stopReason;
    }
    if (asString(record.method) === "session/update") {
        const params = isRecord(record.params) ? record.params : undefined;
        const update = params && isRecord(params.update) ? params.update : undefined;
        const sessionUpdate = update ? asString(update.sessionUpdate) : undefined;
        if (sessionUpdate === "agent_run_end") {
            return "end_turn";
        }
        if (sessionUpdate === "agent_run_cancelled") {
            return "cancelled";
        }
        const updateStopReason = update ? asString(update.stopReason) : undefined;
        if (updateStopReason) {
            return updateStopReason;
        }
    }
    return undefined;
};
const extractProtocolError = (record) => {
    if (asString(record.type) === "res" && record.ok === false) {
        return true;
    }
    return Object.prototype.hasOwnProperty.call(record, "error") && record.error !== undefined;
};
const summarizeError = (errorValue) => {
    if (!isRecord(errorValue)) {
        return "error";
    }
    const message = asString(errorValue.message);
    const code = asString(errorValue.code);
    if (message) {
        return message;
    }
    if (code) {
        return code;
    }
    return "error";
};
const summarizePayload = (record) => {
    const frameType = asString(record.type);
    if (frameType === "req") {
        return `gateway.req:${asString(record.method) ?? "unknown"}`;
    }
    if (frameType === "res") {
        if (record.ok === false) {
            return `gateway.res:error:${summarizeError(record.error)}`;
        }
        const payload = isRecord(record.payload) ? record.payload : undefined;
        const stopReason = payload ? asString(payload.stopReason) : undefined;
        if (stopReason) {
            return `gateway.res:stop:${stopReason}`;
        }
        return "gateway.res:ok";
    }
    if (frameType === "event") {
        const event = asString(record.event) ?? "unknown";
        const payload = isRecord(record.payload) ? record.payload : undefined;
        const stream = payload ? asString(payload.stream) : undefined;
        const data = payload && isRecord(payload.data) ? payload.data : undefined;
        const phase = data ? asString(data.phase) : undefined;
        if (stream && phase) {
            return `gateway.event:${event}:${stream}:${phase}`;
        }
        if (stream) {
            return `gateway.event:${event}:${stream}`;
        }
        return `gateway.event:${event}`;
    }
    const method = asString(record.method);
    if (method) {
        if (method === "terminal/update") {
            const params = isRecord(record.params) ? record.params : undefined;
            const terminalEvent = params ? asString(params.event) : undefined;
            return `acp.notify:terminal/update:${terminalEvent ?? "unknown"}`;
        }
        if (method === "session/update") {
            const params = isRecord(record.params) ? record.params : undefined;
            const update = params && isRecord(params.update) ? params.update : undefined;
            const updateKind = update ? asString(update.sessionUpdate) : undefined;
            return `acp.notify:session/update:${updateKind ?? "unknown"}`;
        }
        return record.id === undefined ? `acp.notify:${method}` : `acp.req:${method}`;
    }
    if (Object.prototype.hasOwnProperty.call(record, "error") && record.error !== undefined) {
        return `acp.res:error:${summarizeError(record.error)}`;
    }
    const result = isRecord(record.result) ? record.result : undefined;
    const stopReason = result ? asString(result.stopReason) : undefined;
    if (stopReason) {
        return `acp.res:stop:${stopReason}`;
    }
    if (result) {
        return "acp.res:ok";
    }
    const keys = Object.keys(record);
    if (keys.length === 0) {
        return "json:empty";
    }
    return `json:${keys.slice(0, 4).join(",")}`;
};
const asBase64SizeBytes = (value) => {
    if (typeof value !== "string" ||
        !value ||
        value.length % 4 !== 0 ||
        !BASE64_PAYLOAD_REGEX.test(value)) {
        return undefined;
    }
    return Buffer.from(value, "base64").byteLength;
};
const DEFAULT_TERMINAL_ARTIFACT_DIR = "/tmp/openclaw_obs_artifacts";
const normalizeTerminalPayloadMode = (value) => value === "artifact" || value === "inline" || value === "size_only" ? value : "size_only";
const persistTerminalBase64Artifact = (dataBase64, artifactDir) => {
    const resolvedDir = path.resolve(asString(artifactDir) ?? DEFAULT_TERMINAL_ARTIFACT_DIR);
    const sha256 = createHash("sha256").update(dataBase64, "utf8").digest("hex");
    const sizeBytes = asBase64SizeBytes(dataBase64) ?? dataBase64.length;
    const artifactRef = path.posix.join("terminal", `${sha256}.b64`);
    const targetPath = path.join(resolvedDir, ...artifactRef.split("/"));
    try {
        mkdirSync(path.dirname(targetPath), { recursive: true });
        try {
            writeFileSync(targetPath, dataBase64, { encoding: "utf8", flag: "wx" });
        }
        catch (err) {
            const code = err && typeof err === "object" && "code" in err
                ? err.code
                : undefined;
            if (code !== "EEXIST") {
                throw err;
            }
        }
        return { artifactRef, sha256, sizeBytes };
    }
    catch {
        return undefined;
    }
};
const sanitizeTerminalParamsForTrace = (method, params, options) => {
    const dataBase64 = params.dataBase64;
    if (typeof dataBase64 !== "string") {
        return undefined;
    }
    const mode = normalizeTerminalPayloadMode(options?.terminalPayloadMode);
    if (mode === "inline") {
        return undefined;
    }
    const isInput = method === "terminal/input";
    const isStdout = method === "terminal/update" && asString(params.event) === "stdout";
    if (!isInput && !isStdout) {
        return undefined;
    }
    const sizeBytes = asBase64SizeBytes(dataBase64) ?? dataBase64.length;
    if (mode === "artifact") {
        const artifactDir = asString(options?.terminalArtifactDir) ?? DEFAULT_TERMINAL_ARTIFACT_DIR;
        const artifact = persistTerminalBase64Artifact(dataBase64, artifactDir);
        if (artifact) {
            const next = { ...params };
            if (isInput) {
                next.inputSizeBytes = artifact.sizeBytes;
                next.inputArtifact = artifact;
            }
            else {
                next.outputSizeBytes = artifact.sizeBytes;
                next.outputArtifact = artifact;
            }
            delete next.dataBase64;
            return next;
        }
    }
    const next = { ...params };
    if (isInput) {
        next.inputSizeBytes = sizeBytes;
    }
    else {
        next.outputSizeBytes = sizeBytes;
    }
    delete next.dataBase64;
    return next;
};
export const classifyTraceDirection = (hop) => {
    if (hop.endsWith("->plugin")) {
        return "inbound";
    }
    if (hop.startsWith("plugin->")) {
        return "outbound";
    }
    return "internal";
};
export const buildStructuredTraceFields = (hop, payload, timestamp) => {
    if (!isRecord(payload)) {
        return {
            timestamp,
            direction: classifyTraceDirection(hop),
            payloadSummary: `non_object:${typeof payload}`,
            protocolError: false,
        };
    }
    const params = isRecord(payload.params) ? payload.params : undefined;
    const framePayload = isRecord(payload.payload) ? payload.payload : undefined;
    const result = isRecord(payload.result) ? payload.result : undefined;
    const error = isRecord(payload.error) ? payload.error : undefined;
    const errorData = error && isRecord(error.data) ? error.data : undefined;
    const { sessionId, sessionKey } = mergeSessionIdentifiers(payload, params, framePayload, result, errorData);
    const requestId = extractRequestId(payload);
    const method = extractMethod(payload);
    const event = extractEvent(payload);
    const terminalId = extractTerminalId(payload);
    const terminalEvent = extractTerminalEvent(payload);
    return {
        timestamp,
        direction: classifyTraceDirection(hop),
        requestId,
        sessionId,
        sessionKey,
        terminalId,
        method,
        event,
        payloadSummary: summarizePayload(payload),
        protocolError: extractProtocolError(payload),
        ...(terminalEvent ? { terminalEvent } : {}),
    };
};
export const sanitizeTracePayloadForLogging = (payload, options) => {
    if (!isRecord(payload)) {
        return payload;
    }
    const method = asString(payload.method);
    if (!method || !method.startsWith("terminal/")) {
        return payload;
    }
    const params = isRecord(payload.params) ? payload.params : undefined;
    if (!params) {
        return payload;
    }
    const sanitizedParams = sanitizeTerminalParamsForTrace(method, params, options);
    if (!sanitizedParams) {
        return payload;
    }
    return {
        ...payload,
        params: sanitizedParams,
    };
};
const normalizeFilterValue = (value) => {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};
export const normalizeTraceFilter = (filter) => ({
    requestId: normalizeFilterValue(filter.requestId),
    sessionId: normalizeFilterValue(filter.sessionId),
});
export const rowMatchesTraceFilter = (row, filter) => {
    const normalizedFilter = normalizeTraceFilter(filter);
    if (normalizedFilter.requestId) {
        const rowRequestId = asRpcId(row.requestId);
        if (rowRequestId !== normalizedFilter.requestId) {
            return false;
        }
    }
    if (normalizedFilter.sessionId) {
        const rowSessionId = asString(row.sessionId);
        const rowSessionKey = asString(row.sessionKey);
        if (rowSessionId !== normalizedFilter.sessionId && rowSessionKey !== normalizedFilter.sessionId) {
            return false;
        }
    }
    return true;
};
