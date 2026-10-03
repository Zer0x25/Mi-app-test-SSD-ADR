import crypto from "node:crypto";
import { promisify } from "node:util";
import { TokenPayload, TokenPayloadSchema, CredencialesInvalidasError } from "./usuarios.schema.js";

const scryptAsync = promisify(crypto.scrypt);

/**
 * Hashea una contraseña usando scrypt con un salt criptográficamente seguro de 16 bytes.
 * Formato resultante: saltHex:hashHex
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifica una contraseña contra su hash usando comparación de tiempo constante.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, "hex");

  try {
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    if (derivedKey.length !== keyBuffer.length) return false;
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

/**
 * Convierte un string o buffer a base64url estándar (RFC 7515).
 */
function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Genera un token JWT firmado con HS256 sin dependencias externas.
 */
export function signJwt(payload: TokenPayload, secret: string, expiresInSeconds = 86400): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerEncoded = base64url(JSON.stringify(header));
  const payloadEncoded = base64url(JSON.stringify(fullPayload));
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(dataToSign)
    .digest();

  const signatureEncoded = base64url(signature);
  return `${dataToSign}.${signatureEncoded}`;
}

/**
 * Valida un token JWT con HS256 y extrae su payload tipado.
 */
export function verifyJwt(token: string, secret: string): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new CredencialesInvalidasError();
  }

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(dataToSign)
    .digest();

  const expectedSignatureEncoded = base64url(expectedSignature);

  if (signatureEncoded !== expectedSignatureEncoded) {
    throw new CredencialesInvalidasError();
  }

  try {
    const payloadJson = Buffer.from(payloadEncoded, "base64url").toString("utf8");
    const parsed = JSON.parse(payloadJson);

    // Verificar expiración
    const now = Math.floor(Date.now() / 1000);
    if (parsed.exp && parsed.exp < now) {
      throw new CredencialesInvalidasError();
    }

    return TokenPayloadSchema.parse(parsed);
  } catch {
    throw new CredencialesInvalidasError();
  }
}
