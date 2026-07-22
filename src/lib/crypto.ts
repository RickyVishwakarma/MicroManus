import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not set");
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32)
    throw new Error("API_KEY_ENCRYPTION_SECRET must decode to 32 bytes");
  return key;
}

/** AES-256-GCM. Output format: base64(iv).base64(ciphertext).base64(tag) */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, enc, cipher.getAuthTag()]
    .map((b) => b.toString("base64"))
    .join(".");
}

export function decrypt(payload: string): string {
  const [iv, data, tag] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}
