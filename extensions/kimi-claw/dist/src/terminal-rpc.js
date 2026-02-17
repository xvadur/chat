import { isPlainRecord as isRecord } from "./utils/json.js";
import { asTrimmedNonEmptyString } from "./utils/text.js";
export const TERMINAL_METHODS = {
    open: "terminal/open",
    input: "terminal/input",
    resize: "terminal/resize",
    close: "terminal/close",
};
export const TERMINAL_UPDATE_METHOD = "terminal/update";
export const TERMINAL_ERROR_CODES = {
    shellDisabled: -32010,
    terminalNotFound: -32011,
    terminalClosed: -32012,
    terminalQuotaExceeded: -32013,
    terminalTimeout: -32014,
};
export const TERMINAL_INVALID_PARAMS = {
    code: -32602,
    message: "invalid params",
};
const readString = (source, field) => asTrimmedNonEmptyString(source[field]);
const readPositiveInteger = (source, field) => {
    const value = source[field];
    if (typeof value !== "number") {
        return undefined;
    }
    if (!Number.isInteger(value) || value <= 0) {
        return undefined;
    }
    return value;
};
const invalid = (field, reason) => ({
    ok: false,
    error: {
        ...TERMINAL_INVALID_PARAMS,
        data: {
            field,
            reason,
        },
    },
});
const parseBaseParams = (value) => {
    if (!isRecord(value)) {
        return invalid("params", "must be an object");
    }
    return { ok: true, value };
};
export const parseTerminalOpenParams = (value) => {
    const parsed = parseBaseParams(value);
    if (!parsed.ok) {
        return parsed;
    }
    const sessionId = readString(parsed.value, "sessionId");
    if (!sessionId) {
        return invalid("sessionId", "must be a non-empty string");
    }
    const cols = readPositiveInteger(parsed.value, "cols");
    if (!cols) {
        return invalid("cols", "must be a positive integer");
    }
    const rows = readPositiveInteger(parsed.value, "rows");
    if (!rows) {
        return invalid("rows", "must be a positive integer");
    }
    const cwd = readString(parsed.value, "cwd");
    return {
        ok: true,
        value: {
            sessionId,
            cols,
            rows,
            ...(cwd ? { cwd } : {}),
        },
    };
};
export const parseTerminalInputParams = (value) => {
    const parsed = parseBaseParams(value);
    if (!parsed.ok) {
        return parsed;
    }
    const terminalId = readString(parsed.value, "terminalId");
    if (!terminalId) {
        return invalid("terminalId", "must be a non-empty string");
    }
    const dataBase64 = readString(parsed.value, "dataBase64");
    if (!dataBase64) {
        return invalid("dataBase64", "must be a non-empty string");
    }
    return {
        ok: true,
        value: {
            terminalId,
            dataBase64,
        },
    };
};
export const parseTerminalResizeParams = (value) => {
    const parsed = parseBaseParams(value);
    if (!parsed.ok) {
        return parsed;
    }
    const terminalId = readString(parsed.value, "terminalId");
    if (!terminalId) {
        return invalid("terminalId", "must be a non-empty string");
    }
    const cols = readPositiveInteger(parsed.value, "cols");
    if (!cols) {
        return invalid("cols", "must be a positive integer");
    }
    const rows = readPositiveInteger(parsed.value, "rows");
    if (!rows) {
        return invalid("rows", "must be a positive integer");
    }
    return {
        ok: true,
        value: {
            terminalId,
            cols,
            rows,
        },
    };
};
export const parseTerminalCloseParams = (value) => {
    const parsed = parseBaseParams(value);
    if (!parsed.ok) {
        return parsed;
    }
    const terminalId = readString(parsed.value, "terminalId");
    if (!terminalId) {
        return invalid("terminalId", "must be a non-empty string");
    }
    return {
        ok: true,
        value: {
            terminalId,
        },
    };
};
export const isTerminalRpcMethod = (method) => Object.values(TERMINAL_METHODS).includes(method);
