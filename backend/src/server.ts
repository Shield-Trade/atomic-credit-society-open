import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { sendSuccess } from "./utils/response";
import { authRoutes } from "./routes/auth-routes";
import { apiKeyRoutes } from "./routes/api-key-routes";
import { agentRoutes } from "./routes/agent-routes";
import { creditRoutes } from "./routes/credit-routes";
import { intentRoutes } from "./routes/intent-routes";
import { loanRoutes } from "./routes/loan-routes";
import { walletRoutes } from "./routes/wallet-routes";
import { adminRoutes } from "./routes/admin-routes";
import { solverRoutes } from "./routes/solver-routes";
import { knowledgeRoutes } from "./routes/knowledge-routes";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { runAutonomyTick } from "./services/autonomy-engine";
import { ensureTreasuryWallet } from "./services/wdk-adapter";
import { db, getStorageMode, initDbStorage } from "./store/db";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  return sendSuccess(res, {
    status: "ok",
    service: "atomic-credit-backend",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/api-keys", apiKeyRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/credit", creditRoutes);
app.use("/api/intent", intentRoutes);
app.use("/api/loan", loanRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/solver", solverRoutes);
app.use("/api/knowledge", knowledgeRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  await initDbStorage();
  await ensureTreasuryWallet();

  setInterval(() => {
    if (!env.autonomyEnabled || !db.runtimeMode.autoEnabled) {
      return;
    }
    void runAutonomyTick().catch((error) => {
      console.error("[autonomy] tick failed:", error);
    });
  }, 15_000);

  app.listen(env.port, () => {
    console.log("Backend started at http://localhost:" + env.port + " storage=" + getStorageMode());
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
