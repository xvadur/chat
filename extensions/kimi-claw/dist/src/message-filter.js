const isRecord = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const METADATA_PREFIX_PATTERNS = [
  /^\s*\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+GMT[+-]\d{1,2}(?::?\d{2})?]\s*/i,
  /^\s*\[working directory:[^\]]*]\s*/i,
  /^\s*\[message_id:[^\]]*]\s*/i,
];
const HEARTBEAT_OK_LINE = "HEARTBEAT_OK";
const UNTRUSTED_METADATA_BLOCK_RE = /^Conversation info \(untrusted metadata\):[\s\S]*?Current time:\s*.*?$/i;

const stripMetadataPrefixesFromLine = (line) => {
  let next = line;
  let changed = false;
  let matched = true;
  while (matched) {
    matched = false;
    for (const pattern of METADATA_PREFIX_PATTERNS) {
      if (!pattern.test(next)) {
        continue;
      }
      next = next.replace(pattern, "");
      changed = true;
      matched = true;
    }
  }
  return { line: next, changed };
};

/**
 * Removes known OpenClaw transport metadata prefixes from text while preserving user content.
 * @param {string} text
 * @returns {string}
 */
export const stripTransportMetadata = (text) => {
  if (!text.includes("[") && !text.includes(HEARTBEAT_OK_LINE) && !UNTRUSTED_METADATA_BLOCK_RE.test(text.trim())) {
    return text;
  }

  if (UNTRUSTED_METADATA_BLOCK_RE.test(text.trim())) {
    return "";
  }

  const lines = text.split(/\r?\n/);
  const cleaned = [];
  let changed = false;

  for (const line of lines) {
    const stripped = stripMetadataPrefixesFromLine(line);
    if (stripped.line.trim() === HEARTBEAT_OK_LINE) {
      changed = true;
      continue;
    }
    if (stripped.changed) {
      changed = true;
      if (!stripped.line.trim()) {
        continue;
      }
    }
    cleaned.push(stripped.line);
  }

  if (!changed) {
    return text;
  }
  return cleaned.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
};

const sanitizePromptNode = (node) => {
  if (typeof node === "string") {
    const cleaned = stripTransportMetadata(node);
    return {
      value: cleaned,
      changed: cleaned !== node,
    };
  }

  if (Array.isArray(node)) {
    let changed = false;
    const values = node.map((item) => {
      const result = sanitizePromptNode(item);
      if (result.changed) {
        changed = true;
      }
      return result.value;
    });
    return {
      value: changed ? values : node,
      changed,
    };
  }

  if (!isRecord(node)) {
    return { value: node, changed: false };
  }

  let changed = false;
  let next = node;

  if (typeof node.type === "string" && node.type === "text" && typeof node.text === "string") {
    const cleanedText = stripTransportMetadata(node.text);
    if (cleanedText !== node.text) {
      next = {
        ...next,
        text: cleanedText,
      };
      changed = true;
    }
  }

  if (Array.isArray(node.content)) {
    const contentResult = sanitizePromptNode(node.content);
    if (contentResult.changed) {
      if (!changed) {
        next = { ...next };
      }
      next.content = contentResult.value;
      changed = true;
    }
  }

  return { value: changed ? next : node, changed };
};

/**
 * Sanitizes ACP prompt payloads by stripping metadata wrappers from text prompt blocks.
 * @param {unknown} payload
 * @returns {unknown}
 */
export const sanitizePromptPayload = (payload) =>
  sanitizePromptNode(payload).value;
