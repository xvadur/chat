import { closeSync, existsSync, openSync, readFileSync, readSync, statSync, } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isPlainRecord as isRecord } from "../utils/json.js";
import { asTrimmedNonEmptyString as asString } from "../utils/text.js";
const LOCAL_HISTORY_LIMIT = 200;
const LOCAL_HISTORY_TAIL_WINDOW_LINES = Math.max(LOCAL_HISTORY_LIMIT * 32, 64);
const LOCAL_HISTORY_TAIL_CHUNK_BYTES = 64 * 1024;
const LOCAL_HISTORY_TAIL_MAX_BYTES = 1024 * 1024;
export class AcpGatewayLocalSessionHistory {
    logger;
    agentId;
    constructor(options) {
        this.logger = options.logger;
        this.agentId = options.agentId;
    }
    readMessages(sessionId, sessionKey) {
        const messages = this.readEntries(sessionId, sessionKey);
        return messages.map((message) => ({
            role: message.role,
            content: message.content,
            toolCallId: message.toolCallId,
            toolName: message.toolName,
        }));
    }
    readEntries(sessionId, sessionKey) {
        const sessionRoot = path.join(this.resolveOpenClawHome(), "agents", this.agentId, "sessions");
        const sessionStorePath = path.join(sessionRoot, "sessions.json");
        if (!existsSync(sessionStorePath)) {
            return [];
        }
        let store = {};
        try {
            const raw = readFileSync(sessionStorePath, "utf-8");
            const parsed = JSON.parse(raw);
            if (!isRecord(parsed)) {
                return [];
            }
            store = parsed;
        }
        catch (err) {
            this.logger.warn(`[acp] failed to read local session store: ${String(err)}`);
            return [];
        }
        const lookupKey = sessionKey ?? sessionId;
        const entry = isRecord(store[lookupKey]) ? store[lookupKey] : undefined;
        if (!entry) {
            return [];
        }
        // Single source of truth for local history:
        // sessions.json entry -> sessionFile (if present) else entry.sessionId + ".jsonl".
        const entrySessionFile = asString(entry.sessionFile);
        const entrySessionId = asString(entry.sessionId);
        if (!entrySessionFile && !entrySessionId) {
            return [];
        }
        const sessionFile = entrySessionFile ?? path.join(sessionRoot, `${entrySessionId}.jsonl`);
        const resolvedSessionFile = path.isAbsolute(sessionFile)
            ? sessionFile
            : path.join(sessionRoot, sessionFile);
        if (!existsSync(resolvedSessionFile)) {
            return [];
        }
        const messages = [];
        const tailLines = this.readTailLines(resolvedSessionFile);
        for (const trimmed of tailLines) {
            let parsed;
            try {
                parsed = JSON.parse(trimmed);
            }
            catch {
                continue;
            }
            if (!isRecord(parsed) || asString(parsed.type) !== "message" || !isRecord(parsed.message)) {
                continue;
            }
            const message = parsed.message;
            const role = asString(message.role);
            if (role !== "user" && role !== "assistant" && role !== "toolResult") {
                continue;
            }
            const rowTimestamp = typeof parsed.ts === "number" && Number.isFinite(parsed.ts)
                ? parsed.ts
                : typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
                    ? message.timestamp
                    : undefined;
            messages.push({
                role,
                content: message.content,
                toolCallId: asString(message.toolCallId) ?? asString(message.tool_call_id),
                toolName: asString(message.toolName) ?? asString(message.tool_name),
                timestamp: rowTimestamp,
            });
            if (messages.length >= LOCAL_HISTORY_LIMIT) {
                break;
            }
        }
        return messages.reverse();
    }
    resolveOpenClawHome() {
        const fromEnv = asString(process.env.OPENCLAW_HOME);
        if (fromEnv) {
            return fromEnv;
        }
        return path.join(os.homedir(), ".openclaw");
    }
    readTailLines(sessionFilePath) {
        let fileSize = 0;
        try {
            fileSize = statSync(sessionFilePath).size;
        }
        catch (err) {
            this.logger.warn(`[acp] failed to stat local session history file: ${String(err)}`);
            return [];
        }
        if (fileSize <= 0) {
            return [];
        }
        let fd;
        try {
            fd = openSync(sessionFilePath, "r");
            let cursor = fileSize;
            let bytesBudget = LOCAL_HISTORY_TAIL_MAX_BYTES;
            let remainder = "";
            const newestFirstLines = [];
            while (cursor > 0 && bytesBudget > 0 && newestFirstLines.length < LOCAL_HISTORY_TAIL_WINDOW_LINES) {
                const chunkBytes = Math.min(LOCAL_HISTORY_TAIL_CHUNK_BYTES, cursor, bytesBudget);
                const nextCursor = cursor - chunkBytes;
                const buffer = Buffer.allocUnsafe(chunkBytes);
                const readBytes = readSync(fd, buffer, 0, chunkBytes, nextCursor);
                if (readBytes <= 0) {
                    break;
                }
                cursor = nextCursor;
                bytesBudget -= readBytes;
                const merged = buffer.toString("utf-8", 0, readBytes) + remainder;
                const parts = merged.split("\n");
                remainder = parts.shift() ?? "";
                for (let idx = parts.length - 1; idx >= 0; idx -= 1) {
                    const line = parts[idx]?.trim();
                    if (!line) {
                        continue;
                    }
                    newestFirstLines.push(line);
                    if (newestFirstLines.length >= LOCAL_HISTORY_TAIL_WINDOW_LINES) {
                        break;
                    }
                }
            }
            const trailing = remainder.trim();
            if (trailing && newestFirstLines.length < LOCAL_HISTORY_TAIL_WINDOW_LINES) {
                newestFirstLines.push(trailing);
            }
            return newestFirstLines;
        }
        catch (err) {
            this.logger.warn(`[acp] failed to read local session history tail: ${String(err)}`);
            return [];
        }
        finally {
            if (fd !== undefined) {
                try {
                    closeSync(fd);
                }
                catch {
                    // ignore close error
                }
            }
        }
    }
}
