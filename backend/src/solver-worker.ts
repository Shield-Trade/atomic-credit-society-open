import { ensureTreasuryWallet } from "./services/wdk-adapter";
import { getStorageMode, initDbStorage, reloadDbStorage } from "./store/db";
import { runSolverWorkerTick } from "./services/solver-worker-engine";

const intervalMs = Number(process.env.SOLVER_WORKER_INTERVAL_MS ?? 5000);

async function start() {
  await initDbStorage();
  await ensureTreasuryWallet();

  console.log("Solver worker started. storage=" + getStorageMode() + " intervalMs=" + intervalMs);

  setInterval(() => {
    void (async () => {
      await reloadDbStorage();
      const report = await runSolverWorkerTick();
      if (report.solvedCount > 0 || report.openIntentCount > 0) {
        console.log(
          "[solver-worker] processedAt=" +
            report.processedAt +
            " open=" +
            report.openIntentCount +
            " solved=" +
            report.solvedCount +
            " skipped=" +
            report.skippedCount
        );
      }
    })();
  }, intervalMs);
}

start().catch((error) => {
  console.error("Failed to start solver worker:", error);
  process.exit(1);
});
