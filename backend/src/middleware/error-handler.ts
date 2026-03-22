import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error";
import { sendError } from "../utils/response";
import { ERROR_CODES } from "../constants/error-codes";

export function notFoundHandler(_req: Request, res: Response) {
  return sendError(res, ERROR_CODES.BAD_REQUEST, 404, "Route not found.");
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return sendError(res, err.code, err.status, err.message, err.details);
  }

  if (err instanceof ZodError) {
    return sendError(res, ERROR_CODES.VALIDATION_ERROR, 400, undefined, err.flatten());
  }

  console.error(err);
  return sendError(res, ERROR_CODES.INTERNAL_ERROR, 500);
}
