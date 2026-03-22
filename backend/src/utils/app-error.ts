import { ERROR_CODES, type ErrorCode } from "../constants/error-codes";

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;

  constructor(
    message: string,
    options?: { code?: ErrorCode; status?: number; details?: unknown }
  ) {
    super(message);
    this.code = options?.code ?? ERROR_CODES.INTERNAL_ERROR;
    this.status = options?.status ?? 500;
    this.details = options?.details;
  }
}
