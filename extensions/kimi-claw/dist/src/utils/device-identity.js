import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
const DEFAULT_IDENTITY_PATH = path.join(homedir(), ".openclaw", "plugins", "kimi-claw", "device.json");
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
function base64UrlEncode(buf) {
    return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function derivePublicKeyRaw(publicKeyPem) {
    const key = crypto.createPublicKey(publicKeyPem);
    const spki = key.export({ type: "spki", format: "der" });
    if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
        spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
        return spki.subarray(ED25519_SPKI_PREFIX.length);
    }
    return spki;
}
function fingerprintPublicKey(publicKeyPem) {
    const raw = derivePublicKeyRaw(publicKeyPem);
    return crypto.createHash("sha256").update(raw).digest("hex");
}
function generateIdentity() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const deviceId = fingerprintPublicKey(publicKeyPem);
    return { deviceId, publicKeyPem, privateKeyPem };
}
export function loadOrCreateDeviceIdentity(filePath = DEFAULT_IDENTITY_PATH) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed?.version === 1 &&
                typeof parsed.deviceId === "string" &&
                typeof parsed.publicKeyPem === "string" &&
                typeof parsed.privateKeyPem === "string") {
                const derivedId = fingerprintPublicKey(parsed.publicKeyPem);
                if (derivedId && derivedId !== parsed.deviceId) {
                    const updated = { ...parsed, deviceId: derivedId };
                    fs.mkdirSync(path.dirname(filePath), { recursive: true });
                    fs.writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
                    return { deviceId: derivedId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem };
                }
                return { deviceId: parsed.deviceId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem };
            }
        }
    }
    catch {
        // fall through to regenerate
    }
    const identity = generateIdentity();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const stored = {
        version: 1,
        deviceId: identity.deviceId,
        publicKeyPem: identity.publicKeyPem,
        privateKeyPem: identity.privateKeyPem,
        createdAtMs: Date.now(),
    };
    fs.writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
    try {
        fs.chmodSync(filePath, 0o600);
    }
    catch {
        // best-effort
    }
    return identity;
}
function signPayload(privateKeyPem, payload) {
    const key = crypto.createPrivateKey(privateKeyPem);
    const sig = crypto.sign(null, Buffer.from(payload, "utf8"), key);
    return base64UrlEncode(sig);
}
function buildAuthPayload(params) {
    const version = params.nonce ? "v2" : "v1";
    const scopes = params.scopes.join(",");
    const token = params.token ?? "";
    const base = [
        version,
        params.deviceId,
        params.clientId,
        params.clientMode,
        params.role,
        scopes,
        String(params.signedAtMs),
        token,
    ];
    if (version === "v2") {
        base.push(params.nonce ?? "");
    }
    return base.join("|");
}
export function buildDeviceAuthField(params) {
    const signedAtMs = Date.now();
    const payload = buildAuthPayload({
        deviceId: params.identity.deviceId,
        clientId: params.clientId,
        clientMode: params.clientMode,
        role: params.role,
        scopes: params.scopes,
        signedAtMs,
        token: params.token,
        nonce: params.nonce,
    });
    const signature = signPayload(params.identity.privateKeyPem, payload);
    const publicKey = base64UrlEncode(derivePublicKeyRaw(params.identity.publicKeyPem));
    const field = {
        id: params.identity.deviceId,
        publicKey,
        signature,
        signedAt: signedAtMs,
    };
    if (params.nonce) {
        field.nonce = params.nonce;
    }
    return field;
}
