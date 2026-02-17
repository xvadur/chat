import path from "node:path";
import { stripTransportMetadata } from "../message-filter.js";
import { isPlainRecord as isRecord } from "../utils/json.js";
import { asTrimmedNonEmptyString as asString } from "../utils/text.js";
const KIMI_FILE_URI_PREFIX = "kimi-file://";
const KIMI_FILE_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const truncate = (value, limit) => value.length <= limit ? value : `${value.slice(0, limit)}...`;
const escapeXmlAttribute = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const asPromptBlock = (value) => {
    if (!isRecord(value) || typeof value.type !== "string") {
        return null;
    }
    switch (value.type) {
        case "text":
            return { type: "text", text: asString(value.text) ?? "" };
        case "image":
            return {
                type: "image",
                data: asString(value.data),
                mimeType: asString(value.mimeType),
                mime_type: asString(value.mime_type),
                uri: asString(value.uri),
                fileName: asString(value.fileName),
                file_name: asString(value.file_name),
                name: asString(value.name),
            };
        case "file":
            return {
                type: "file",
                data: asString(value.data),
                text: asString(value.text),
                mimeType: asString(value.mimeType),
                mime_type: asString(value.mime_type),
                uri: asString(value.uri),
                fileName: asString(value.fileName),
                file_name: asString(value.file_name),
                filename: asString(value.filename),
                name: asString(value.name),
            };
        case "resource_link":
            return {
                type: "resource_link",
                uri: asString(value.uri),
                title: asString(value.title),
                name: asString(value.name),
                mimeType: asString(value.mimeType),
                mime_type: asString(value.mime_type),
            };
        case "resource":
            return {
                type: "resource",
                resource: isRecord(value.resource)
                    ? {
                        uri: asString(value.resource.uri),
                        mimeType: asString(value.resource.mimeType),
                        mime_type: asString(value.resource.mime_type),
                        text: asString(value.resource.text),
                        data: asString(value.resource.data),
                        fileName: asString(value.resource.fileName),
                        file_name: asString(value.resource.file_name),
                        filename: asString(value.resource.filename),
                        name: asString(value.resource.name),
                    }
                    : undefined,
                uri: asString(value.uri),
                mimeType: asString(value.mimeType),
                mime_type: asString(value.mime_type),
                text: asString(value.text),
                data: asString(value.data),
                fileName: asString(value.fileName),
                file_name: asString(value.file_name),
                filename: asString(value.filename),
                name: asString(value.name),
            };
        default:
            return null;
    }
};
export const extractPromptBlocks = (input) => {
    const values = [];
    if (Array.isArray(input)) {
        values.push(...input);
    }
    else if (typeof input === "string") {
        values.push({ type: "text", text: input });
    }
    else if (isRecord(input) && Array.isArray(input.content)) {
        values.push(...input.content);
    }
    else if (isRecord(input) && typeof input.type === "string") {
        values.push(input);
    }
    return values.map((item) => asPromptBlock(item)).filter((item) => !!item);
};
export const resolveUriFileName = (uri) => {
    try {
        const parsed = new URL(uri);
        const fromPath = path.basename(parsed.pathname);
        if (fromPath && fromPath !== "." && fromPath !== "/" && fromPath !== "\\") {
            return decodeURIComponent(fromPath);
        }
    }
    catch {
        // Fall through to plain-path parsing.
    }
    const fromPath = path.basename(uri);
    if (!fromPath || fromPath === "." || fromPath === "/" || fromPath === "\\") {
        return undefined;
    }
    return fromPath;
};
export const parseKimiFileResourceLinkUri = (uri) => {
    if (!uri.startsWith(KIMI_FILE_URI_PREFIX)) {
        return {};
    }
    const fileId = uri.slice(KIMI_FILE_URI_PREFIX.length).trim();
    if (!fileId) {
        return { error: "resource_link kimi-file uri requires file_id" };
    }
    if (!KIMI_FILE_ID_PATTERN.test(fileId)) {
        return { error: "resource_link kimi-file uri has invalid file_id" };
    }
    return { fileId };
};
const getKimiFileFailureReason = (failure) => {
    if ((failure.code === "http_4xx" || failure.code === "http_5xx") &&
        failure.httpStatus !== undefined) {
        return `http_${failure.httpStatus}`;
    }
    return failure.code;
};
const buildKimiFileRefText = (options) => {
    return `<KIMI_REF type="file" path="${escapeXmlAttribute(options.localPath)}" name="${escapeXmlAttribute(options.name)}" id="${escapeXmlAttribute(options.fileId)}" />`;
};
const buildKimiFileFailedRefText = (options) => {
    return `<KIMI_REF type="file" path="" name="${escapeXmlAttribute(options.name)}" id="${escapeXmlAttribute(options.fileId)}" status="download_failed" reason="${escapeXmlAttribute(options.reason)}" />`;
};
export class AcpGatewayPromptConverter {
    logger;
    constructor(options) {
        this.logger = options.logger;
    }
    toGatewayPrompt(blocks, options) {
        const parts = [];
        const inputBlocks = [];
        const attachments = [];
        const kimiFileResolutions = [];
        const kimiFileResolutionDedup = new Set();
        for (const block of blocks) {
            if (block.type === "text") {
                const text = stripTransportMetadata(block.text);
                if (text) {
                    parts.push(text);
                    inputBlocks.push({
                        type: "text",
                        text,
                    });
                }
                continue;
            }
            if (block.type === "image") {
                const mime = block.mimeType ?? block.mime_type ?? "application/octet-stream";
                if (!block.data && !block.uri) {
                    return { error: "image block requires data or uri" };
                }
                const fileName = block.fileName ??
                    block.file_name ??
                    block.name ??
                    (block.uri ? resolveUriFileName(block.uri) : undefined);
                const imageDescriptor = [`mime=${mime}`];
                const imageBlock = {
                    type: "image",
                    mimeType: mime,
                    ...(fileName ? { fileName } : {}),
                };
                if (block.data) {
                    imageDescriptor.push(`size=${block.data.length}`);
                    imageBlock.data = block.data;
                    this.pushGatewayAttachment(attachments, {
                        type: "image",
                        content: block.data,
                        mimeType: mime,
                        fileName,
                    });
                }
                if (block.uri) {
                    imageDescriptor.push(`uri=${block.uri}`);
                    imageBlock.uri = block.uri;
                }
                parts.push(`[image ${imageDescriptor.join(" ")}]`);
                inputBlocks.push(imageBlock);
                continue;
            }
            if (block.type === "resource_link") {
                const uri = block.uri;
                if (!uri) {
                    return { error: "resource_link block requires uri" };
                }
                const mimeType = block.mimeType ?? block.mime_type;
                const traceContext = options?.traceContext;
                const kimiFileParse = parseKimiFileResourceLinkUri(uri);
                if (kimiFileParse.error) {
                    return { error: kimiFileParse.error };
                }
                const kimiFileResolution = options?.kimiFileResolutionsByUri?.get(uri);
                if (kimiFileResolution) {
                    const dedupKey = kimiFileResolution.status === "resolved"
                        ? `${kimiFileResolution.fileId}:resolved`
                        : `${kimiFileResolution.fileId}:${kimiFileResolution.code}`;
                    if (!kimiFileResolutionDedup.has(dedupKey)) {
                        kimiFileResolutionDedup.add(dedupKey);
                        kimiFileResolutions.push(kimiFileResolution);
                    }
                }
                if (kimiFileParse.fileId && kimiFileResolution?.status === "resolved") {
                    const kimiRefText = buildKimiFileRefText({
                        fileId: kimiFileParse.fileId,
                        name: kimiFileResolution.name,
                        localPath: kimiFileResolution.localPath,
                    });
                    parts.push(kimiRefText);
                    inputBlocks.push({
                        type: "text",
                        text: kimiRefText,
                        kimiFile: this.toKimiFileResolutionRecord(kimiFileResolution),
                    });
                    if (traceContext) {
                        this.logger.info(`[acp] kimi-file converted to KIMI_REF requestId=${String(traceContext.requestId)} sessionId=${traceContext.sessionId} fileId=${kimiFileParse.fileId} status=resolved localPath=${kimiFileResolution.localPath}`);
                    }
                    continue;
                }
                if (kimiFileParse.fileId && kimiFileResolution?.status === "resolve_failed") {
                    const reason = getKimiFileFailureReason(kimiFileResolution);
                    const fallbackName = kimiFileResolution.name ??
                        (typeof block.name === "string" && block.name.trim()
                            ? block.name.trim()
                            : typeof block.title === "string" && block.title.trim()
                                ? block.title.trim()
                                : kimiFileParse.fileId);
                    const kimiRefText = buildKimiFileFailedRefText({
                        fileId: kimiFileParse.fileId,
                        name: fallbackName,
                        reason,
                    });
                    parts.push(kimiRefText);
                    inputBlocks.push({
                        type: "text",
                        text: kimiRefText,
                        kimiFile: this.toKimiFileResolutionRecord(kimiFileResolution),
                    });
                    if (traceContext) {
                        this.logger.warn(`[acp] kimi-file converted to degraded KIMI_REF requestId=${String(traceContext.requestId)} sessionId=${traceContext.sessionId} fileId=${kimiFileParse.fileId} status=download_failed reason=${reason}`);
                    }
                    continue;
                }
                const title = block.title ?? block.name ?? "resource";
                parts.push(`[resource_link title=${title} uri=${uri}]`);
                inputBlocks.push({
                    type: "resource_link",
                    uri,
                    ...(block.title ? { title: block.title } : {}),
                    ...(block.name ? { name: block.name } : {}),
                    ...(mimeType ? { mimeType } : {}),
                    ...(kimiFileResolution
                        ? { kimiFile: this.toKimiFileResolutionRecord(kimiFileResolution) }
                        : {}),
                });
                continue;
            }
            if (block.type === "file") {
                const mime = block.mimeType ?? block.mime_type ?? "application/octet-stream";
                const fileName = block.fileName ??
                    block.file_name ??
                    block.filename ??
                    block.name ??
                    (block.uri ? resolveUriFileName(block.uri) : undefined);
                const text = block.text ? stripTransportMetadata(block.text) : undefined;
                const encodedText = text ? Buffer.from(text, "utf-8").toString("base64") : undefined;
                if (!block.data && !encodedText && !block.uri) {
                    return { error: "file block requires data, text, or uri" };
                }
                const fileDescriptor = [`mime=${mime}`, ...(fileName ? [`name=${fileName}`] : [])];
                const fileBlock = {
                    type: "file",
                    mimeType: mime,
                    ...(fileName ? { fileName } : {}),
                };
                if (block.data) {
                    fileDescriptor.push(`size=${block.data.length}`);
                    fileBlock.data = block.data;
                    this.pushGatewayAttachment(attachments, {
                        type: "file",
                        content: block.data,
                        mimeType: mime,
                        fileName,
                    });
                }
                else if (encodedText) {
                    fileDescriptor.push(`text=${truncate(text ?? "", 80)}`);
                    fileBlock.text = text;
                    this.pushGatewayAttachment(attachments, {
                        type: "file",
                        content: encodedText,
                        mimeType: mime,
                        fileName,
                    });
                }
                if (block.uri) {
                    fileDescriptor.push(`uri=${block.uri}`);
                    fileBlock.uri = block.uri;
                }
                parts.push(`[file ${fileDescriptor.join(" ")}]`);
                inputBlocks.push(fileBlock);
                continue;
            }
            if (block.type === "resource") {
                const resource = block.resource ?? {};
                const uri = resource.uri ?? block.uri;
                if (!uri) {
                    return { error: "resource block requires uri" };
                }
                const mime = resource.mimeType ?? resource.mime_type ?? block.mimeType ?? block.mime_type;
                const text = (resource.text ?? block.text)
                    ? stripTransportMetadata(resource.text ?? block.text ?? "")
                    : undefined;
                const data = resource.data ?? block.data;
                const fileName = resource.fileName ??
                    resource.file_name ??
                    resource.filename ??
                    resource.name ??
                    block.fileName ??
                    block.file_name ??
                    block.filename ??
                    block.name ??
                    resolveUriFileName(uri);
                inputBlocks.push({
                    type: "resource",
                    uri,
                    ...(mime ? { mimeType: mime } : {}),
                    ...(text ? { text } : {}),
                    ...(data ? { data } : {}),
                    ...(fileName ? { fileName } : {}),
                });
                if (data) {
                    this.pushGatewayAttachment(attachments, {
                        type: "file",
                        content: data,
                        mimeType: mime,
                        fileName,
                    });
                }
                else if (text) {
                    this.pushGatewayAttachment(attachments, {
                        type: "file",
                        content: Buffer.from(text, "utf-8").toString("base64"),
                        mimeType: mime ?? "text/plain",
                        fileName,
                    });
                }
                if (text) {
                    parts.push(`[resource uri=${uri}${mime ? ` mime=${mime}` : ""} text=${truncate(text, 120)}]`);
                }
                else if (data) {
                    parts.push(`[resource uri=${uri}${mime ? ` mime=${mime}` : ""} size=${data.length}]`);
                }
                else {
                    parts.push(`[resource uri=${uri}${mime ? ` mime=${mime}` : ""}]`);
                }
            }
        }
        if (!parts.length) {
            return {
                message: "(empty prompt)",
                inputBlocks: [],
                attachments: [],
                kimiFileResolutions: [],
            };
        }
        return {
            message: parts.join("\n"),
            inputBlocks,
            attachments,
            kimiFileResolutions,
        };
    }
    pushGatewayAttachment(attachments, options) {
        if (!options.content) {
            return;
        }
        attachments.push({
            type: options.type,
            content: options.content,
            ...(options.mimeType ? { mimeType: options.mimeType } : {}),
            ...(options.fileName ? { fileName: options.fileName } : {}),
        });
    }
    toKimiFileResolutionRecord(resolution) {
        if (resolution.status === "resolved") {
            return {
                status: resolution.status,
                fileId: resolution.fileId,
                id: resolution.id,
                name: resolution.name,
                contentType: resolution.contentType,
                ...(resolution.sizeBytes !== undefined ? { sizeBytes: resolution.sizeBytes } : {}),
                downloadUrlSource: resolution.downloadUrlSource,
                localPath: resolution.localPath,
                localFileName: resolution.localFileName,
                localSizeBytes: resolution.localSizeBytes,
                localCacheHit: resolution.localCacheHit,
            };
        }
        return {
            status: resolution.status,
            fileId: resolution.fileId,
            ...(resolution.name ? { name: resolution.name } : {}),
            code: resolution.code,
            message: resolution.message,
            retriable: resolution.retriable,
            ...(resolution.httpStatus !== undefined ? { httpStatus: resolution.httpStatus } : {}),
        };
    }
}
