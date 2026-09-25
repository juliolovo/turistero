import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Cifrado simétrico AES-256-GCM para tokens guardados en BD. Formato: v1.<iv>.<tag>.<datos> (base64url).
 * La clave sale de TOKEN_ENCRYPTION_KEY (cualquier cadena larga; se deriva con SHA-256).
 */
function key(secret: string | undefined): Buffer {
  if (!secret || secret.length < 16) throw new Error("TOKEN_ENCRYPTION_KEY ausente o demasiado corta (mín. 16 caracteres)");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string, secret = process.env.TOKEN_ENCRYPTION_KEY): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptToken(enc: string, secret = process.env.TOKEN_ENCRYPTION_KEY): string {
  const [v, iv, tag, data] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Formato de token cifrado inválido");
  const d = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
