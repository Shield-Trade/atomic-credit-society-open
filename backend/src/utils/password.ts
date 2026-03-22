import crypto from "crypto";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [salt, storedHash] = hash.split(":");

  if (!salt || !storedHash) {
    return false;
  }

  const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const stored = Buffer.from(storedHash, "hex");
  const test = Buffer.from(testHash, "hex");

  if (stored.length !== test.length) {
    return false;
  }

  return crypto.timingSafeEqual(stored, test);
}
