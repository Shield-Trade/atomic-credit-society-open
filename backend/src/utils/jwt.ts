import crypto from "crypto";
import { env } from "../config/env";
import { AppError } from "./app-error";
import { ERROR_CODES } from "../constants/error-codes";
import type { UserRole } from "../types/domain";

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  exp: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString();
}

export function signToken(payload: { sub: string; email: string; role: UserRole }, expiresInSeconds = 60 * 60 * 24) {
  const header = { alg: "HS256", typ: "JWT" };
  const fullPayload: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerPart}.${payloadPart}`;

  const signature = crypto
    .createHmac("sha256", env.jwtSecret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}

export function verifyToken(token: string): { sub: string; email: string; role: UserRole } {
  const [headerPart, payloadPart, signaturePart] = token.split(".");

  if (!headerPart || !payloadPart || !signaturePart) {
    throw new AppError("Malformed token.", {
      code: ERROR_CODES.INVALID_TOKEN,
      status: 401
    });
  }

  const data = `${headerPart}.${payloadPart}`;
  const expectedSignature = crypto
    .createHmac("sha256", env.jwtSecret)
    .update(data)
    .digest("base64url");

  const provided = Buffer.from(signaturePart);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new AppError("Token signature mismatch.", {
      code: ERROR_CODES.INVALID_TOKEN,
      status: 401
    });
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart)) as TokenPayload;

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError("Token expired.", {
      code: ERROR_CODES.INVALID_TOKEN,
      status: 401
    });
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role ?? "user"
  };
}
