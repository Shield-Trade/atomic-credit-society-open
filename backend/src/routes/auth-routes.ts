import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db, saveDb } from "../store/db";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { sendSuccess } from "../utils/response";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";
import { isAdminEmail } from "../constants/admin";
import type { UserRole } from "../types/domain";
import { requireAuth } from "../middleware/auth";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8)
});

function resolveRoleByEmail(email: string): UserRole {
  return isAdminEmail(email) ? "admin" : "user";
}

export const authRoutes = Router();

authRoutes.post("/register", (req, res) => {
  const payload = registerSchema.parse(req.body);

  const existing = db.users.find((user) => user.email.toLowerCase() === payload.email.toLowerCase());
  if (existing) {
    throw new AppError("Email already registered.", {
      code: ERROR_CODES.USER_ALREADY_EXISTS,
      status: 409
    });
  }

  const user = {
    id: uuidv4(),
    email: payload.email.toLowerCase(),
    passwordHash: hashPassword(payload.password),
    role: resolveRoleByEmail(payload.email),
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  saveDb();

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role
  });

  return sendSuccess(
    res,
    {
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      token
    },
    201
  );
});

authRoutes.post("/login", (req, res) => {
  const payload = loginSchema.parse(req.body);
  const user = db.users.find((item) => item.email === payload.email.toLowerCase());

  if (!user || !verifyPassword(payload.password, user.passwordHash)) {
    throw new AppError("Invalid login credentials.", {
      code: ERROR_CODES.INVALID_CREDENTIALS,
      status: 401
    });
  }

  const resolvedRole = resolveRoleByEmail(user.email);
  if (user.role !== resolvedRole) {
    user.role = resolvedRole;
    saveDb();
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role
  });

  return sendSuccess(res, {
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    },
    token
  });
});

authRoutes.post("/change-password", requireAuth, (req, res) => {
  const payload = changePasswordSchema.parse(req.body);
  const user = db.users.find((item) => item.id === req.auth!.userId);

  if (!user) {
    throw new AppError("User not found.", {
      code: ERROR_CODES.USER_NOT_FOUND,
      status: 404
    });
  }

  if (!verifyPassword(payload.currentPassword, user.passwordHash)) {
    throw new AppError("Invalid current password.", {
      code: ERROR_CODES.INVALID_CREDENTIALS,
      status: 401
    });
  }

  if (payload.currentPassword === payload.newPassword) {
    throw new AppError("New password must be different from current password.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400
    });
  }

  user.passwordHash = hashPassword(payload.newPassword);
  saveDb();

  return sendSuccess(res, {
    updated: true
  });
});
