import { db } from "../store/db";
import { solveIntent } from "./solver-engine";

export interface SolverWorkerReport {
  processedAt: string;
  openIntentCount: number;
  solvedCount: number;
  skippedCount: number;
}

export async function runSolverWorkerTick(options?: { limit?: number }): Promise<SolverWorkerReport> {
  if (!db.runtimeMode.autoEnabled) {
    return {
      processedAt: new Date().toISOString(),
      openIntentCount: db.intents.filter((intent) => intent.status === "open").length,
      solvedCount: 0,
      skippedCount: 0
    };
  }

  const openIntents = db.intents.filter((intent) => intent.status === "open");
  const limit = options?.limit ?? 20;

  let solvedCount = 0;
  let skippedCount = 0;

  for (const intent of openIntents.slice(0, limit)) {
    try {
      await solveIntent({
        intentId: intent.id,
        solverAgentId: null
      });
      solvedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  return {
    processedAt: new Date().toISOString(),
    openIntentCount: openIntents.length,
    solvedCount,
    skippedCount
  };
}
