import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Passwords for email + password sign-in, hashed with scrypt (memory-hard,
 * built into Node). Stored as `scrypt$N$r$p$salt$hash`, so the cost can be
 * raised later without breaking existing hashes.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)))
  );
}

/** Why a new password is not acceptable, or null. */
export function passwordProblem(password: string): "too_short" | "too_long" | "too_simple" | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too_long";
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|12345678|password|qwertyui)/i.test(password)) {
    return "too_simple";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to compare against when the account has none, so timing does not reveal which accounts exist. */
let decoy: Promise<string> | null = null;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(12).toString("hex"));
  return decoy;
}
