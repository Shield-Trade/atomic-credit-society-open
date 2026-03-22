import type { Response } from "express";
import { ERROR_MESSAGES } from "../constants/error-messages";
import type { ErrorCode } from "../constants/error-codes";

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({
    success: true,
    data
  });
}

export function sendError(
  res: Response,
  code: ErrorCode,
  status: number,
  message?: string,
  details?: unknown
) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message: message ?? ERROR_MESSAGES[code],
      details: details ?? undefined
    }
  });
}
