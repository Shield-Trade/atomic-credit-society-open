import { Router } from "express";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db, saveDb } from "../store/db";
import { sendSuccess } from "../utils/response";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";

const createApiKeySchema = z.object({
  name: z.string().min(2).max(64)
});

export const apiKeyRoutes = Router();
apiKeyRoutes.use(requireAuth);

apiKeyRoutes.get("/", (req, res) => {
  const userId = req.auth!.userId;
  const keys = db.apiKeys
    .filter((item) => item.userId === userId)
    .map((item) => ({
      id: item.id,
      name: item.name,
      keyPreview: item.key.slice(0, 12) + "...",
      createdAt: item.createdAt,
      lastUsedAt: item.lastUsedAt
    }));

  return sendSuccess(res, { apiKeys: keys });
});

apiKeyRoutes.post("/", (req, res) => {
  const payload = createApiKeySchema.parse(req.body);
  const userId = req.auth!.userId;

  const apiKey = {
    id: uuidv4(),
    userId,
    name: payload.name,
    key: "acs_" + randomBytes(18).toString("hex"),
    createdAt: new Date().toISOString(),
    lastUsedAt: null
  };

  db.apiKeys.push(apiKey);
  saveDb();

  return sendSuccess(
    res,
    {
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,
        createdAt: apiKey.createdAt
      }
    },
    201
  );
});

apiKeyRoutes.delete("/:id", (req, res) => {
  const userId = req.auth!.userId;
  const key = db.apiKeys.find((item) => item.id === req.params.id);

  if (!key) {
    throw new AppError("API key not found.", {
      code: ERROR_CODES.BAD_REQUEST,
      status: 404
    });
  }

  if (key.userId !== userId) {
    throw new AppError("Cannot delete key from another user.", {
      code: ERROR_CODES.FORBIDDEN,
      status: 403
    });
  }

  db.apiKeys = db.apiKeys.filter((item) => item.id !== key.id);
  saveDb();
  return sendSuccess(res, { deleted: true });
});
