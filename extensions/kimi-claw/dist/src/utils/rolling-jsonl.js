import { appendFileSync, mkdirSync, renameSync, rmSync, statSync, } from "node:fs";
import path from "node:path";
export const DEFAULT_LOG_ROLLING_MAX_BYTES = 500 * 1024 * 1024;
export const DEFAULT_LOG_ROLLING_MAX_BACKUPS = 1;
const normalizePositiveInteger = (value, fallback) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }
    const normalized = Math.trunc(value);
    if (normalized < 0) {
        return fallback;
    }
    return normalized;
};
const readFileSize = (filePath) => {
    try {
        return statSync(filePath).size;
    }
    catch (err) {
        const ioErr = err;
        if (ioErr?.code === "ENOENT") {
            return 0;
        }
        throw err;
    }
};
const rotateLogFile = (filePath, maxBackups) => {
    if (maxBackups <= 0) {
        rmSync(filePath, { force: true });
        return;
    }
    for (let idx = maxBackups; idx >= 1; idx -= 1) {
        const source = idx === 1 ? filePath : `${filePath}.${idx - 1}`;
        const target = `${filePath}.${idx}`;
        rmSync(target, { force: true });
        try {
            statSync(source);
        }
        catch (err) {
            const ioErr = err;
            if (ioErr?.code === "ENOENT") {
                continue;
            }
            throw err;
        }
        renameSync(source, target);
    }
};
export const createRollingJsonlWriter = (options) => {
    const target = options.filePath.trim();
    if (!target) {
        return (_row) => undefined;
    }
    const maxBytes = normalizePositiveInteger(options.maxBytes, DEFAULT_LOG_ROLLING_MAX_BYTES);
    const maxBackups = normalizePositiveInteger(options.maxBackups, DEFAULT_LOG_ROLLING_MAX_BACKUPS);
    const resolved = path.resolve(target);
    const contextLabel = options.contextLabel.trim() || "log";
    try {
        mkdirSync(path.dirname(resolved), { recursive: true });
    }
    catch (err) {
        options.logger.warn(`[${contextLabel}] failed to create log directory for ${resolved}: ${String(err)}`);
    }
    let warnedWriteFailure = false;
    let warnedOversizedRow = false;
    return (row) => {
        const line = `${JSON.stringify(row)}\n`;
        const lineBytes = Buffer.byteLength(line, "utf-8");
        try {
            const currentSize = readFileSize(resolved);
            if (currentSize + lineBytes > maxBytes) {
                rotateLogFile(resolved, maxBackups);
            }
            appendFileSync(resolved, line, "utf-8");
            if (lineBytes > maxBytes && !warnedOversizedRow) {
                warnedOversizedRow = true;
                options.logger.warn(`[${contextLabel}] single JSONL row is larger than rolling limit maxBytes=${maxBytes} file=${resolved}`);
            }
        }
        catch (err) {
            if (!warnedWriteFailure) {
                warnedWriteFailure = true;
                options.logger.warn(`[${contextLabel}] failed to append rolling log file ${resolved}: ${String(err)}`);
            }
        }
    };
};
