import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripTransportMetadata } from "../message-filter.js";
import { isRecord } from "../utils/json.js";
import { asTrimmedNonEmptyString as asString } from "../utils/text.js";
const ACP_HISTORY_LIMIT = 50;
const toHistoryText = (content) => {
    if (typeof content === "string" && content.trim()) {
        const cleaned = stripTransportMetadata(content.trim());
        return cleaned || undefined;
    }
    if (!Array.isArray(content)) {
        return undefined;
    }
    const parts = [];
    for (const block of content) {
        if (!isRecord(block)) {
            continue;
        }
        if (asString(block.type) !== "text") {
            continue;
        }
        const text = asString(block.text);
        if (text) {
            parts.push(text);
        }
    }
    if (parts.length === 0) {
        return undefined;
    }
    const cleaned = stripTransportMetadata(parts.join("\n"));
    return cleaned || undefined;
};
export const resolveOpenClawHome = () => {
    const fromEnv = asString(process.env.OPENCLAW_HOME);
    if (fromEnv) {
        return fromEnv;
    }
    return path.join(os.homedir(), ".openclaw");
};
export const replayHistoryFromLocalSessionFiles = (params) => {
    const sessionRoot = path.join(resolveOpenClawHome(), "agents", params.agentId, "sessions");
    const sessionStorePath = path.join(sessionRoot, "sessions.json");
    if (!existsSync(sessionStorePath)) {
        params.logger.debug?.(`[acp-history] sessions store missing path=${sessionStorePath}`);
        return 0;
    }
    let storeRaw = "";
    try {
        storeRaw = readFileSync(sessionStorePath, "utf-8");
    }
    catch (err) {
        params.logger.warn(`[acp-history] failed to read sessions store: ${String(err)}`);
        return 0;
    }
    let store = {};
    try {
        const parsed = JSON.parse(storeRaw);
        if (isRecord(parsed)) {
            store = parsed;
        }
    }
    catch (err) {
        params.logger.warn(`[acp-history] failed to parse sessions store: ${String(err)}`);
        return 0;
    }
    const findEntryBySessionId = () => {
        for (const [key, value] of Object.entries(store)) {
            if (!isRecord(value)) {
                continue;
            }
            if (asString(value.sessionId) === params.sessionId) {
                return { key, entry: value };
            }
        }
        return undefined;
    };
    const entryByKey = params.requestedSessionKey && isRecord(store[params.requestedSessionKey])
        ? store[params.requestedSessionKey]
        : undefined;
    const matched = findEntryBySessionId();
    const entry = entryByKey ?? matched?.entry;
    const sessionFile = asString(entry?.sessionFile) ?? path.join(sessionRoot, `${params.sessionId}.jsonl`);
    if (!existsSync(sessionFile)) {
        params.logger.debug?.(`[acp-history] session file missing path=${sessionFile}`);
        return 0;
    }
    let raw = "";
    try {
        raw = readFileSync(sessionFile, "utf-8");
    }
    catch (err) {
        params.logger.warn(`[acp-history] failed to read session file: ${String(err)}`);
        return 0;
    }
    const updates = [];
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        let evt;
        try {
            evt = JSON.parse(trimmed);
        }
        catch {
            continue;
        }
        if (!isRecord(evt) || asString(evt.type) !== "message" || !isRecord(evt.message)) {
            continue;
        }
        const role = asString(evt.message.role);
        if (role !== "user" && role !== "assistant") {
            continue;
        }
        const text = toHistoryText(evt.message.content);
        if (!text) {
            continue;
        }
        updates.push({ role, text });
    }
    const tail = updates.slice(-ACP_HISTORY_LIMIT);
    if (tail.length === 0) {
        params.logger.debug?.(`[acp-history] no replayable user/assistant text in session file=${sessionFile}`);
        return 0;
    }
    for (const row of tail) {
        const update = row.role === "user"
            ? {
                sessionUpdate: "user_message_chunk",
                content: { type: "text", text: row.text },
            }
            : {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: row.text },
            };
        params.send({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
                sessionId: params.sessionId,
                update,
                ...(params.requestId
                    ? {
                        _meta: {
                            requestId: params.requestId,
                        },
                    }
                    : {}),
            },
        });
    }
    params.logger.info(`[acp-history] replayed ${tail.length} updates sessionId=${params.sessionId} key=${params.requestedSessionKey ?? matched?.key ?? "unknown"}`);
    return tail.length;
};
export const readLatestAssistantTextFromLocalSessionFiles = (params) => {
    const assistantMessages = [];
    const silentLogger = {
        info: () => { },
        warn: (message) => params.logger.warn(message),
        error: (message) => params.logger.error(message),
        debug: () => { },
    };
    replayHistoryFromLocalSessionFiles({
        agentId: params.agentId,
        sessionId: params.sessionId,
        requestedSessionKey: params.requestedSessionKey,
        logger: silentLogger,
        send: (message) => {
            if (!isRecord(message) || asString(message.method) !== "session/update" || !isRecord(message.params)) {
                return;
            }
            const payload = message.params;
            if (!isRecord(payload.update)) {
                return;
            }
            const update = payload.update;
            if (asString(update.sessionUpdate) !== "agent_message_chunk" || !isRecord(update.content)) {
                return;
            }
            const text = asString(update.content.text);
            if (!text) {
                return;
            }
            assistantMessages.push(text);
        },
    });
    if (assistantMessages.length === 0) {
        return undefined;
    }
    return assistantMessages[assistantMessages.length - 1];
};
