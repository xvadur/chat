import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPlainRecord as isRecord } from "../utils/json.js";
import { asTrimmedNonEmptyString as asString } from "../utils/text.js";
import { parseKimiFileResourceLinkUri } from "./prompt-converter.js";
const MAX_KIMI_FILE_NAME_LENGTH = 120;
const KIMI_BOT_TOKEN_HEADER = "X-Kimi-Bot-Token";
export class AcpGatewayKimiFileResolver {
    logger;
    kimiapiHost;
    kimiBotToken;
    kimiFileResolveTimeoutMs;
    kimiFileDownloadDir;
    fetchImpl;
    writeObsEvent;
    traceAll;
    constructor(options) {
        this.logger = options.logger;
        this.kimiapiHost = options.kimiapiHost;
        this.kimiBotToken = options.kimiBotToken;
        this.kimiFileResolveTimeoutMs = options.kimiFileResolveTimeoutMs;
        this.kimiFileDownloadDir = options.kimiFileDownloadDir;
        this.fetchImpl = options.fetchImpl;
        this.writeObsEvent = options.writeObsEvent;
        this.traceAll = options.traceAll;
    }
    buildResolutionPlan(blocks) {
        const fileIdByUri = new Map();
        for (const block of blocks) {
            if (block.type !== "resource_link" || !block.uri) {
                continue;
            }
            const parsed = parseKimiFileResourceLinkUri(block.uri);
            if (parsed.error) {
                return {
                    fileIds: [],
                    fileIdByUri,
                    error: parsed.error,
                };
            }
            if (!parsed.fileId) {
                continue;
            }
            fileIdByUri.set(block.uri, parsed.fileId);
        }
        const fileIds = [...new Set(fileIdByUri.values())];
        return {
            fileIds,
            fileIdByUri,
        };
    }
    async resolveMetadataForPrompt(plan, sessionId, requestId) {
        if (plan.fileIds.length === 0) {
            return new Map();
        }
        const resolvedByFileId = new Map();
        const resolutionEntries = await Promise.all(plan.fileIds.map(async (fileId) => {
            const resolution = await this.resolveKimiFileMetadata(fileId, sessionId, requestId);
            return [fileId, resolution];
        }));
        for (const [fileId, resolution] of resolutionEntries) {
            resolvedByFileId.set(fileId, resolution);
        }
        const resolvedByUri = new Map();
        for (const [uri, fileId] of plan.fileIdByUri.entries()) {
            const resolution = resolvedByFileId.get(fileId);
            if (resolution) {
                resolvedByUri.set(uri, resolution);
            }
        }
        return resolvedByUri;
    }
    redactUrlQuery(url) {
        const raw = url.trim();
        if (!raw) {
            return { url: raw, queryRedacted: false };
        }
        try {
            const parsed = new URL(raw);
            const queryRedacted = parsed.search.length > 0;
            parsed.search = "";
            parsed.hash = "";
            return { url: parsed.toString(), queryRedacted };
        }
        catch {
            const queryRedacted = raw.includes("?");
            const withoutQuery = queryRedacted ? raw.split("?")[0] : raw;
            const withoutHash = withoutQuery.split("#")[0] ?? "";
            return { url: withoutHash, queryRedacted };
        }
    }
    sanitizeKimiFileTracePayload(value) {
        const seen = new WeakMap();
        const visit = (current, key) => {
            if (current === null ||
                current === undefined ||
                typeof current === "boolean" ||
                typeof current === "number") {
                return current;
            }
            if (typeof current === "string") {
                if (key === "signUrl" || key === "sign_url") {
                    return this.redactUrlQuery(current).url;
                }
                return current;
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
            for (const [childKey, entry] of Object.entries(obj)) {
                next[childKey] = visit(entry, childKey);
            }
            return next;
        };
        return visit(value);
    }
    async resolveKimiFileMetadata(fileId, sessionId, requestId) {
        const obsStartedAt = Date.now();
        const metadataUrl = this.resolveKimiFileMetadataUrl(fileId);
        const obsRequestId = String(requestId);
        const obsBase = {
            component: "connector",
            domain: "kimi_file",
            requestId: obsRequestId,
            sessionId,
            sessionKey: sessionId,
            hop: "plugin->kimi_file_api",
            where: "AcpGatewayBridge.resolveKimiFileMetadata",
        };
        this.writeObsEvent?.({
            ...obsBase,
            name: "kimi_file.metadata_request",
            severity: "info",
            summary: `kimi-file metadata request fileId=${fileId}`,
            payload: {
                fileId,
                url: metadataUrl ?? null,
                timeoutMs: this.kimiFileResolveTimeoutMs,
            },
        });
        const emitMetadataResponse = (options) => {
            this.writeObsEvent?.({
                ...obsBase,
                name: "kimi_file.metadata_response",
                severity: options.severity,
                durationMs: Date.now() - obsStartedAt,
                summary: `kimi-file metadata response fileId=${fileId}${options.httpStatus !== null ? ` httpStatus=${options.httpStatus}` : ""}${options.code ? ` code=${options.code}` : ""}`,
                payload: {
                    fileId,
                    httpStatus: options.httpStatus,
                    ...(options.code ? { code: options.code } : {}),
                    ...(options.message ? { message: options.message } : {}),
                    ...(options.retriable !== undefined ? { retriable: options.retriable } : {}),
                    ...(options.downloadUrlSource ? { downloadUrlSource: options.downloadUrlSource } : {}),
                    ...(options.downloadUrl ? { downloadUrl: options.downloadUrl } : {}),
                    ...(options.downloadUrlQueryRedacted !== undefined
                        ? { downloadUrlQueryRedacted: options.downloadUrlQueryRedacted }
                        : {}),
                },
            });
        };
        if (!this.kimiBotToken) {
            emitMetadataResponse({
                severity: "warn",
                httpStatus: null,
                code: "token_missing",
                message: "bridge token is required to resolve kimi-file metadata",
                retriable: false,
            });
            return this.makeKimiFileResolutionFailure({
                fileId,
                sessionId,
                requestId,
                code: "token_missing",
                message: "bridge token is required to resolve kimi-file metadata",
                retriable: false,
            });
        }
        if (!metadataUrl) {
            emitMetadataResponse({
                severity: "warn",
                httpStatus: null,
                code: "invalid_config",
                message: "kimiapiHost is invalid",
                retriable: false,
            });
            return this.makeKimiFileResolutionFailure({
                fileId,
                sessionId,
                requestId,
                code: "invalid_config",
                message: "kimiapiHost is invalid",
                retriable: false,
            });
        }
        const timeoutController = new AbortController();
        const timeoutHandle = setTimeout(() => {
            timeoutController.abort();
        }, this.kimiFileResolveTimeoutMs);
        timeoutHandle.unref?.();
        try {
            const metadataHeaders = {
                [KIMI_BOT_TOKEN_HEADER]: this.kimiBotToken ?? "",
                Accept: "application/json",
            };
            this.traceAll({
                ts: new Date().toISOString(),
                trace: "kimi-file",
                stage: "metadata_request",
                fileId,
                sessionId,
                requestId,
                method: "GET",
                url: metadataUrl,
                headers: { ...metadataHeaders, [KIMI_BOT_TOKEN_HEADER]: "(redacted)" },
            });
            const response = await this.fetchImpl(metadataUrl, {
                method: "GET",
                headers: metadataHeaders,
                signal: timeoutController.signal,
            });
            if (!response.ok) {
                const code = response.status >= 500 ? "http_5xx" : "http_4xx";
                const retriable = response.status >= 500 || response.status === 429;
                this.traceAll({
                    ts: new Date().toISOString(),
                    trace: "kimi-file",
                    stage: "metadata_response_error",
                    fileId,
                    sessionId,
                    requestId,
                    httpStatus: response.status,
                    code,
                });
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code,
                    message: `files api request failed with status ${response.status}`,
                    retriable,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    sessionId,
                    requestId,
                    code,
                    httpStatus: response.status,
                    message: `files api request failed with status ${response.status}`,
                    retriable,
                });
            }
            let payload;
            try {
                payload = await response.json();
            }
            catch {
                this.traceAll({
                    ts: new Date().toISOString(),
                    trace: "kimi-file",
                    stage: "metadata_response_error",
                    fileId,
                    sessionId,
                    requestId,
                    httpStatus: response.status,
                    code: "invalid_response",
                    message: "response is not valid json",
                });
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code: "invalid_response",
                    message: "files api response is not valid json",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    sessionId,
                    requestId,
                    code: "invalid_response",
                    message: "files api response is not valid json",
                    retriable: false,
                });
            }
            this.traceAll({
                ts: new Date().toISOString(),
                trace: "kimi-file",
                stage: "metadata_response_ok",
                fileId,
                sessionId,
                requestId,
                httpStatus: response.status,
                body: this.sanitizeKimiFileTracePayload(payload),
            });
            if (!isRecord(payload)) {
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code: "invalid_response",
                    message: "files api response must be an object",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    sessionId,
                    requestId,
                    code: "invalid_response",
                    message: "files api response must be an object",
                    retriable: false,
                });
            }
            const responseFileId = asString(payload.id);
            if (!responseFileId) {
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code: "invalid_response",
                    message: "files api response missing id",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    sessionId,
                    requestId,
                    code: "invalid_response",
                    message: "files api response missing id",
                    retriable: false,
                });
            }
            const meta = isRecord(payload.meta) ? payload.meta : undefined;
            if (!meta) {
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code: "invalid_response",
                    message: "files api response missing meta",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    sessionId,
                    requestId,
                    code: "invalid_response",
                    message: "files api response missing meta",
                    retriable: false,
                });
            }
            const name = asString(meta.name);
            if (!name) {
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code: "invalid_response",
                    message: "files api response missing meta.name",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    sessionId,
                    requestId,
                    code: "invalid_response",
                    message: "files api response missing meta.name",
                    retriable: false,
                });
            }
            const contentType = asString(meta.contentType) ?? asString(meta.content_type);
            if (!contentType) {
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code: "invalid_response",
                    message: "files api response missing meta.contentType",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    name,
                    sessionId,
                    requestId,
                    code: "invalid_response",
                    message: "files api response missing meta.contentType",
                    retriable: false,
                });
            }
            const rawSizeBytes = meta.sizeBytes ?? meta.size_bytes;
            const parsedSizeBytes = typeof rawSizeBytes === "number"
                ? rawSizeBytes
                : typeof rawSizeBytes === "string" && /^\d+$/.test(rawSizeBytes.trim())
                    ? Number(rawSizeBytes.trim())
                    : rawSizeBytes;
            const sizeBytes = parsedSizeBytes === undefined
                ? undefined
                : typeof parsedSizeBytes === "number" &&
                    Number.isFinite(parsedSizeBytes) &&
                    parsedSizeBytes >= 0
                    ? Math.trunc(parsedSizeBytes)
                    : null;
            if (sizeBytes === null) {
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code: "invalid_response",
                    message: "files api response has invalid meta.sizeBytes",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    name,
                    sessionId,
                    requestId,
                    code: "invalid_response",
                    message: "files api response has invalid meta.sizeBytes",
                    retriable: false,
                });
            }
            const blob = isRecord(payload.blob) ? payload.blob : undefined;
            const signUrl = asString(blob?.signUrl) ?? asString(blob?.sign_url);
            const previewUrl = this.readKimiFilePreviewUrl(payload);
            const downloadUrl = signUrl ?? previewUrl;
            const downloadUrlSource = signUrl
                ? "blob.signUrl"
                : previewUrl
                    ? "parseJob.result.image.thumbnail.previewUrl"
                    : undefined;
            if (!downloadUrl || !downloadUrlSource) {
                emitMetadataResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    code: "missing_download_url",
                    message: "files api response missing blob.signUrl and image preview fallback url",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId,
                    name,
                    sessionId,
                    requestId,
                    code: "missing_download_url",
                    message: "files api response missing blob.signUrl and image preview fallback url",
                    retriable: false,
                });
            }
            const redactedDownloadUrl = this.redactUrlQuery(downloadUrl);
            emitMetadataResponse({
                severity: "info",
                httpStatus: response.status,
                downloadUrlSource,
                downloadUrl: redactedDownloadUrl.url,
                downloadUrlQueryRedacted: redactedDownloadUrl.queryRedacted,
            });
            const resolution = {
                status: "resolved",
                fileId,
                id: responseFileId,
                name,
                contentType,
                ...(sizeBytes !== undefined ? { sizeBytes } : {}),
                downloadUrl,
                downloadUrlSource,
                localPath: "",
                localFileName: "",
                localSizeBytes: 0,
                localCacheHit: false,
            };
            const localFile = await this.ensureKimiFileDownloaded({
                fileId,
                name,
                downloadUrl,
                sessionId,
                requestId,
            });
            if ("status" in localFile && localFile.status === "resolve_failed") {
                return localFile;
            }
            resolution.localPath = localFile.localPath;
            resolution.localFileName = localFile.localFileName;
            resolution.localSizeBytes = localFile.localSizeBytes;
            resolution.localCacheHit = localFile.localCacheHit;
            this.logger.info(`[acp] kimi-file metadata resolved requestId=${String(requestId)} sessionId=${sessionId} fileId=${fileId} source=${downloadUrlSource} contentType=${contentType} sizeBytes=${String(sizeBytes ?? "unknown")} localPath=${resolution.localPath} localSizeBytes=${String(resolution.localSizeBytes)} cacheHit=${String(resolution.localCacheHit)}`);
            return resolution;
        }
        catch (error) {
            const errorName = error instanceof Error ? error.name : "";
            const code = errorName === "AbortError" ? "timeout" : "network_error";
            const message = errorName === "AbortError"
                ? `files api request timed out after ${this.kimiFileResolveTimeoutMs}ms`
                : "files api request failed due to network error";
            emitMetadataResponse({
                severity: "warn",
                httpStatus: null,
                code,
                message,
                retriable: code === "timeout" || code === "network_error",
            });
            return this.makeKimiFileResolutionFailure({
                fileId,
                sessionId,
                requestId,
                code,
                message,
                retriable: code === "timeout" || code === "network_error",
            });
        }
        finally {
            clearTimeout(timeoutHandle);
        }
    }
    resolveKimiFileMetadataUrl(fileId) {
        try {
            const normalizedBase = this.kimiapiHost.endsWith("/")
                ? this.kimiapiHost
                : `${this.kimiapiHost}/`;
            const url = new URL(`files/${encodeURIComponent(fileId)}`, normalizedBase);
            return url.toString();
        }
        catch {
            return undefined;
        }
    }
    sanitizeKimiFileName(name) {
        const baseName = path.basename(name).trim();
        const withoutControlChars = baseName.replace(/[\u0000-\u001f\u007f]/g, "");
        const normalizedSeparators = withoutControlChars.replace(/[\\/]+/g, "_");
        const sanitized = normalizedSeparators
            .replace(/[^\p{L}\p{N}._-]+/gu, "_")
            .replace(/_+/g, "_")
            .replace(/^\.+/, "")
            .replace(/^_+|_+$/g, "")
            .slice(0, MAX_KIMI_FILE_NAME_LENGTH);
        return sanitized || "file";
    }
    findExistingKimiFileDownload(fileId) {
        if (!existsSync(this.kimiFileDownloadDir)) {
            return undefined;
        }
        const prefix = `${fileId}_`;
        let entries;
        try {
            entries = readdirSync(this.kimiFileDownloadDir, { withFileTypes: true });
        }
        catch {
            return undefined;
        }
        const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of sortedEntries) {
            if (!entry.isFile() || !entry.name.startsWith(prefix)) {
                continue;
            }
            const localPath = path.join(this.kimiFileDownloadDir, entry.name);
            try {
                const stats = statSync(localPath);
                if (!stats.isFile() || stats.size <= 0) {
                    continue;
                }
                return {
                    localPath,
                    localFileName: entry.name,
                    localSizeBytes: stats.size,
                };
            }
            catch {
                continue;
            }
        }
        return undefined;
    }
    async ensureKimiFileDownloaded(options) {
        const obsStartedAt = Date.now();
        const obsRequestId = String(options.requestId);
        const obsBase = {
            component: "connector",
            domain: "kimi_file",
            requestId: obsRequestId,
            sessionId: options.sessionId,
            sessionKey: options.sessionId,
            hop: "plugin->kimi_file_download",
            where: "AcpGatewayBridge.ensureKimiFileDownloaded",
        };
        const redactedDownloadUrl = this.redactUrlQuery(options.downloadUrl);
        const emitDownloadRequest = (payload, summary) => {
            this.writeObsEvent?.({
                ...obsBase,
                name: "kimi_file.download_request",
                severity: "info",
                summary,
                payload,
            });
        };
        const emitDownloadResponse = (response) => {
            this.writeObsEvent?.({
                ...obsBase,
                name: "kimi_file.download_response",
                severity: response.severity,
                durationMs: Date.now() - obsStartedAt,
                summary: `kimi-file download response fileId=${options.fileId}${response.httpStatus !== null ? ` httpStatus=${response.httpStatus}` : ""}${response.code ? ` code=${response.code}` : ""}`,
                payload: {
                    fileId: options.fileId,
                    httpStatus: response.httpStatus,
                    localPath: response.localPath,
                    localSizeBytes: response.localSizeBytes,
                    localCacheHit: response.localCacheHit,
                    ...(response.code ? { code: response.code } : {}),
                    ...(response.message ? { message: response.message } : {}),
                    ...(response.retriable !== undefined ? { retriable: response.retriable } : {}),
                },
            });
        };
        const localFileName = `${options.fileId}_${this.sanitizeKimiFileName(options.name)}`;
        const localPath = path.join(this.kimiFileDownloadDir, localFileName);
        try {
            mkdirSync(this.kimiFileDownloadDir, { recursive: true });
        }
        catch (error) {
            emitDownloadRequest({
                fileId: options.fileId,
                url: redactedDownloadUrl.url,
                urlQueryRedacted: redactedDownloadUrl.queryRedacted,
                localPath,
                localCacheHit: false,
            }, `kimi-file download request fileId=${options.fileId}`);
            emitDownloadResponse({
                severity: "warn",
                httpStatus: null,
                localPath,
                localSizeBytes: null,
                localCacheHit: false,
                code: "invalid_config",
                message: `failed to create kimi-file download dir ${this.kimiFileDownloadDir}: ${String(error)}`,
                retriable: false,
            });
            return this.makeKimiFileResolutionFailure({
                fileId: options.fileId,
                name: options.name,
                sessionId: options.sessionId,
                requestId: options.requestId,
                code: "invalid_config",
                message: `failed to create kimi-file download dir ${this.kimiFileDownloadDir}: ${String(error)}`,
                retriable: false,
            });
        }
        const existingFile = this.findExistingKimiFileDownload(options.fileId);
        if (existingFile) {
            emitDownloadRequest({
                fileId: options.fileId,
                url: redactedDownloadUrl.url,
                urlQueryRedacted: redactedDownloadUrl.queryRedacted,
                localPath: existingFile.localPath,
                localCacheHit: true,
            }, `kimi-file download request fileId=${options.fileId} (cache_hit=true)`);
            emitDownloadResponse({
                severity: "info",
                httpStatus: null,
                localPath: existingFile.localPath,
                localSizeBytes: existingFile.localSizeBytes,
                localCacheHit: true,
            });
            this.logger.info(`[acp] kimi-file cache hit requestId=${String(options.requestId)} sessionId=${options.sessionId} fileId=${options.fileId} localPath=${existingFile.localPath} localSizeBytes=${String(existingFile.localSizeBytes)}`);
            this.traceAll({
                ts: new Date().toISOString(),
                trace: "kimi-file",
                stage: "download_cache_hit",
                fileId: options.fileId,
                sessionId: options.sessionId,
                requestId: options.requestId,
                localPath: existingFile.localPath,
                localSizeBytes: existingFile.localSizeBytes,
            });
            return {
                ...existingFile,
                localCacheHit: true,
            };
        }
        const timeoutController = new AbortController();
        const timeoutHandle = setTimeout(() => {
            timeoutController.abort();
        }, this.kimiFileResolveTimeoutMs);
        timeoutHandle.unref?.();
        try {
            emitDownloadRequest({
                fileId: options.fileId,
                url: redactedDownloadUrl.url,
                urlQueryRedacted: redactedDownloadUrl.queryRedacted,
                localPath,
                localCacheHit: false,
            }, `kimi-file download request fileId=${options.fileId}`);
            this.traceAll({
                ts: new Date().toISOString(),
                trace: "kimi-file",
                stage: "download_request",
                fileId: options.fileId,
                sessionId: options.sessionId,
                requestId: options.requestId,
                method: "GET",
                url: redactedDownloadUrl.url,
                localPath,
            });
            const response = await this.fetchImpl(options.downloadUrl, {
                method: "GET",
                signal: timeoutController.signal,
            });
            if (!response.ok) {
                const code = response.status >= 500 ? "http_5xx" : "http_4xx";
                const retriable = response.status >= 500 || response.status === 429;
                this.traceAll({
                    ts: new Date().toISOString(),
                    trace: "kimi-file",
                    stage: "download_response_error",
                    fileId: options.fileId,
                    sessionId: options.sessionId,
                    requestId: options.requestId,
                    httpStatus: response.status,
                    code,
                });
                emitDownloadResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    localPath,
                    localSizeBytes: null,
                    localCacheHit: false,
                    code,
                    message: `file download request failed with status ${response.status}`,
                    retriable,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId: options.fileId,
                    name: options.name,
                    sessionId: options.sessionId,
                    requestId: options.requestId,
                    code,
                    message: `file download request failed with status ${response.status}`,
                    retriable,
                    httpStatus: response.status,
                });
            }
            let bytes;
            try {
                bytes = Buffer.from(await response.arrayBuffer());
            }
            catch {
                emitDownloadResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    localPath,
                    localSizeBytes: null,
                    localCacheHit: false,
                    code: "network_error",
                    message: "file download read failed while reading response body",
                    retriable: true,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId: options.fileId,
                    name: options.name,
                    sessionId: options.sessionId,
                    requestId: options.requestId,
                    code: "network_error",
                    message: "file download read failed while reading response body",
                    retriable: true,
                });
            }
            if (bytes.byteLength <= 0) {
                emitDownloadResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    localPath,
                    localSizeBytes: 0,
                    localCacheHit: false,
                    code: "invalid_response",
                    message: "downloaded file payload is empty",
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId: options.fileId,
                    name: options.name,
                    sessionId: options.sessionId,
                    requestId: options.requestId,
                    code: "invalid_response",
                    message: "downloaded file payload is empty",
                    retriable: false,
                });
            }
            try {
                writeFileSync(localPath, bytes);
            }
            catch (error) {
                emitDownloadResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    localPath,
                    localSizeBytes: null,
                    localCacheHit: false,
                    code: "invalid_config",
                    message: `failed to persist downloaded file at ${localPath}: ${String(error)}`,
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId: options.fileId,
                    name: options.name,
                    sessionId: options.sessionId,
                    requestId: options.requestId,
                    code: "invalid_config",
                    message: `failed to persist downloaded file at ${localPath}: ${String(error)}`,
                    retriable: false,
                });
            }
            let writtenBytes = bytes.byteLength;
            try {
                const stats = statSync(localPath);
                if (!stats.isFile() || stats.size <= 0) {
                    emitDownloadResponse({
                        severity: "warn",
                        httpStatus: response.status,
                        localPath,
                        localSizeBytes: null,
                        localCacheHit: false,
                        code: "invalid_response",
                        message: `downloaded file was not persisted correctly at ${localPath}`,
                        retriable: false,
                    });
                    return this.makeKimiFileResolutionFailure({
                        fileId: options.fileId,
                        name: options.name,
                        sessionId: options.sessionId,
                        requestId: options.requestId,
                        code: "invalid_response",
                        message: `downloaded file was not persisted correctly at ${localPath}`,
                        retriable: false,
                    });
                }
                writtenBytes = stats.size;
            }
            catch (error) {
                emitDownloadResponse({
                    severity: "warn",
                    httpStatus: response.status,
                    localPath,
                    localSizeBytes: null,
                    localCacheHit: false,
                    code: "invalid_response",
                    message: `downloaded file verification failed at ${localPath}: ${String(error)}`,
                    retriable: false,
                });
                return this.makeKimiFileResolutionFailure({
                    fileId: options.fileId,
                    name: options.name,
                    sessionId: options.sessionId,
                    requestId: options.requestId,
                    code: "invalid_response",
                    message: `downloaded file verification failed at ${localPath}: ${String(error)}`,
                    retriable: false,
                });
            }
            this.logger.info(`[acp] kimi-file download stored requestId=${String(options.requestId)} sessionId=${options.sessionId} fileId=${options.fileId} localPath=${localPath} localSizeBytes=${String(writtenBytes)}`);
            emitDownloadResponse({
                severity: "info",
                httpStatus: response.status,
                localPath,
                localSizeBytes: writtenBytes,
                localCacheHit: false,
            });
            this.traceAll({
                ts: new Date().toISOString(),
                trace: "kimi-file",
                stage: "download_response_ok",
                fileId: options.fileId,
                sessionId: options.sessionId,
                requestId: options.requestId,
                httpStatus: response.status,
                localPath,
                localSizeBytes: writtenBytes,
            });
            return {
                localPath,
                localFileName,
                localSizeBytes: writtenBytes,
                localCacheHit: false,
            };
        }
        catch (error) {
            const errorName = error instanceof Error ? error.name : "";
            const code = errorName === "AbortError" ? "timeout" : "network_error";
            const message = errorName === "AbortError"
                ? `file download timed out after ${this.kimiFileResolveTimeoutMs}ms`
                : "file download request failed due to network error";
            emitDownloadResponse({
                severity: "warn",
                httpStatus: null,
                localPath,
                localSizeBytes: null,
                localCacheHit: false,
                code,
                message,
                retriable: code === "timeout" || code === "network_error",
            });
            return this.makeKimiFileResolutionFailure({
                fileId: options.fileId,
                name: options.name,
                sessionId: options.sessionId,
                requestId: options.requestId,
                code,
                message,
                retriable: code === "timeout" || code === "network_error",
            });
        }
        finally {
            clearTimeout(timeoutHandle);
        }
    }
    readKimiFilePreviewUrl(payload) {
        const parseJob = isRecord(payload.parseJob)
            ? payload.parseJob
            : isRecord(payload.parse_job)
                ? payload.parse_job
                : undefined;
        if (!parseJob) {
            return undefined;
        }
        const result = isRecord(parseJob.result) ? parseJob.result : undefined;
        if (!result) {
            return undefined;
        }
        const image = isRecord(result.image) ? result.image : undefined;
        if (!image) {
            return undefined;
        }
        const thumbnail = isRecord(image.thumbnail) ? image.thumbnail : undefined;
        if (!thumbnail) {
            return undefined;
        }
        return asString(thumbnail.previewUrl) ?? asString(thumbnail.preview_url);
    }
    makeKimiFileResolutionFailure(options) {
        this.logger.warn(`[acp] kimi-file resolve/download failed requestId=${String(options.requestId)} sessionId=${options.sessionId} fileId=${options.fileId} code=${options.code}${options.httpStatus !== undefined ? ` status=${options.httpStatus}` : ""} message=${options.message}`);
        return {
            status: "resolve_failed",
            fileId: options.fileId,
            ...(options.name ? { name: options.name } : {}),
            code: options.code,
            message: options.message,
            retriable: options.retriable,
            ...(options.httpStatus !== undefined ? { httpStatus: options.httpStatus } : {}),
        };
    }
}
