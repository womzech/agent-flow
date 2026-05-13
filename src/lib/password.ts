/**
 * Password hashing for the multi-user RBAC layer.
 *
 * We use PBKDF2-SHA256 via the WebCrypto SubtleCrypto API for two reasons:
 *  - Available in every runtime AgentFlow supports (Edge / Node / tests).
 *  - Zero new dependencies; argon2/bcrypt would require native bindings.
 *
 * Parameters are stored alongside each user row (`password_iter`) so we can
 * raise the iteration count for new users without breaking older logins.
 */

const ITER_DEFAULT = 100_000;
const SALT_BYTES = 32;
const HASH_BYTES = 32;

function subtle(): SubtleCrypto {
  const g = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto;
  if (!g?.subtle) throw new Error("WebCrypto SubtleCrypto unavailable (need Node 18.17+ or polyfill)");
  return g.subtle;
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, bytes: number): Promise<Uint8Array> {
  const key = await subtle().importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  // Allocate a guaranteed ArrayBuffer for salt to satisfy BufferSource in strict TS.
  const saltBuf = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuf).set(salt);
  const bits = await subtle().deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations, hash: "SHA-256" },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

export interface PasswordRecord {
  password_hash: string;
  password_salt: string;
  password_iter: number;
}

/** Generate a fresh hash for a new user / password reset. */
export async function hashPassword(password: string, iterations = ITER_DEFAULT): Promise<PasswordRecord> {
  if (!password || password.length < 6) throw new Error("password must be at least 6 characters");
  const saltBuf = new Uint8Array(SALT_BYTES);
  ((globalThis as unknown as { crypto: Crypto }).crypto).getRandomValues(saltBuf);
  const hash = await pbkdf2(password, saltBuf, iterations, HASH_BYTES);
  return {
    password_hash: toB64(hash),
    password_salt: toB64(saltBuf),
    password_iter: iterations,
  };
}

/** Constant-time-ish verify against a stored record. */
export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  if (!password) return false;
  try {
    const salt = fromB64(record.password_salt);
    const candidate = await pbkdf2(password, salt, record.password_iter, HASH_BYTES);
    const expected = fromB64(record.password_hash);
    if (candidate.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < candidate.length; i++) diff |= candidate[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}
