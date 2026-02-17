import { homedir } from "node:os";
import { join } from "node:path";
import { createRollingJsonlWriter, DEFAULT_LOG_ROLLING_MAX_BYTES, } from "./utils/rolling-jsonl.js";
import { asTrimmedNonEmptyString as asNonEmptyString } from "./utils/text.js";
const collectSecrets = (options) => {
    const secrets = [];
    const bridgeToken = asNonEmptyString(options.bridgeToken);
    const gatewayToken = asNonEmptyString(options.gatewayToken);
    if (bridgeToken) {
        secrets.push(bridgeToken);
    }
    if (gatewayToken) {
        secrets.push(gatewayToken);
    }
    // Dedupe + redact longest first to avoid partial overlap issues.
    return Array.from(new Set(secrets)).sort((a, b) => b.length - a.length);
};
export const redactTokens = (value, options) => {
    const secrets = collectSecrets(options);
    if (secrets.length === 0) {
        return value;
    }
    const seen = new WeakMap();
    const redactString = (input) => {
        let next = input;
        for (const secret of secrets) {
            if (!secret) {
                continue;
            }
            // Avoid overly-aggressive substring redaction for suspiciously short secrets.
            const shouldReplaceAnywhere = secret.length >= 8;
            if (shouldReplaceAnywhere) {
                next = next.split(secret).join("(redacted)");
            }
            else if (next === secret) {
                next = "(redacted)";
            }
        }
        return next;
    };
    const visit = (current) => {
        if (current === null ||
            current === undefined ||
            typeof current === "boolean" ||
            typeof current === "number") {
            return current;
        }
        if (typeof current === "string") {
            return redactString(current);
        }
        if (Array.isArray(current)) {
            const existing = seen.get(current);
            if (existing) {
                return existing;
            }
            const next = [];
            seen.set(current, next);
            for (const entry of current) {
                next.push(visit(entry));
            }
            return next;
        }
        if (typeof current !== "object") {
            return current;
        }
        const obj = current;
        const existing = seen.get(obj);
        if (existing) {
            return existing;
        }
        const next = Object.create(Object.getPrototypeOf(obj));
        seen.set(obj, next);
        for (const [key, entry] of Object.entries(obj)) {
            next[key] = visit(entry);
        }
        return next;
    };
    return visit(value);
};
const DEFAULT_LOG_DIR = join(homedir(), ".kimi", "kimi-claw", "log");
export const DEFAULT_OBS_TRACE_FILE = join(DEFAULT_LOG_DIR, "openclaw_all_trace.log");
export const createObsEventWriter = (options) => {
    const target = options.filePath ?? DEFAULT_OBS_TRACE_FILE;
    if (!target.trim()) {
        return (_event) => undefined;
    }
    const writeJsonlRow = createRollingJsonlWriter({
        filePath: target,
        logger: options.logger,
        contextLabel: "obs",
        maxBytes: DEFAULT_LOG_ROLLING_MAX_BYTES,
    });
    const redaction = options.redaction;
    return (event) => {
        const row = {
            ...event,
            ts: asNonEmptyString(event.ts) ?? new Date().toISOString(),
        };
        const sanitized = redaction ? redactTokens(row, redaction) : row;
        writeJsonlRow(sanitized);
    };
};
