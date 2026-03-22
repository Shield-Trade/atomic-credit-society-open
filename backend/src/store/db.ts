import fs from "fs";
import path from "path";
import { Pool } from "pg";
import type {
  Agent,
  AgentClaim,
  AutonomyPolicy,
  AutonomyTickRecord,
  ApiKey,
  BorrowIntent,
  CreditTokenTransaction,
  KnowledgeLearning,
  KnowledgePoint,
  Loan,
  User,
  Wallet,
  WalletTransaction
} from "../types/domain";

interface DataStore {
  users: User[];
  apiKeys: ApiKey[];
  agents: Agent[];
  agentClaims: AgentClaim[];
  intents: BorrowIntent[];
  loans: Loan[];
  wallets: Wallet[];
  walletTransactions: WalletTransaction[];
  creditTokenTransactions: CreditTokenTransaction[];
  knowledgePoints: KnowledgePoint[];
  knowledgeLearnings: KnowledgeLearning[];
  autonomyPolicies: AutonomyPolicy[];
  autonomyTickReports: AutonomyTickRecord[];
  runtimeMode: {
    autoEnabled: boolean;
    updatedAt: string;
  };
}

type StorageMode = "file" | "postgres";

const dbFilePath = process.env.DB_FILE_PATH ?? path.resolve(process.cwd(), "backend", "data", "db.json");
const databaseUrl = process.env.DATABASE_URL?.trim() || "";

let storageMode: StorageMode = "file";
let pgPool: Pool | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function createEmptyStore(): DataStore {
  return {
    users: [],
    apiKeys: [],
    agents: [],
    agentClaims: [],
    intents: [],
    loans: [],
    wallets: [],
    walletTransactions: [],
    creditTokenTransactions: [],
    knowledgePoints: [],
    knowledgeLearnings: [],
    autonomyPolicies: [],
    autonomyTickReports: [],
    runtimeMode: {
      autoEnabled: false,
      updatedAt: new Date().toISOString()
    }
  };
}

function normalizeStore(input: Partial<DataStore>): DataStore {
  const agents = (input.agents ?? []).map((agent) => ({
    ...agent,
    reputationScore: agent.reputationScore ?? 50,
    isDisabled: agent.isDisabled ?? false,
    disabledAt: agent.disabledAt ?? null
  }));

  const intents = (input.intents ?? []).map((intent) => ({
    ...intent,
    source: intent.source ?? "borrow_request",
    requestedLenderId: intent.requestedLenderId ?? null,
    autoRepayAfterMinutes:
      typeof intent.autoRepayAfterMinutes === "number" && intent.autoRepayAfterMinutes > 0
        ? intent.autoRepayAfterMinutes
        : null,
    solverAgentId: intent.solverAgentId ?? null,
    solverReason: intent.solverReason ?? null,
    solverEvaluatedAt: intent.solverEvaluatedAt ?? null,
    recommendedInterest: typeof intent.recommendedInterest === "number" ? intent.recommendedInterest : null,
    humanApprovedAt: intent.humanApprovedAt ?? null,
    status: intent.status ?? "open"
  }));

  const users = (input.users ?? []).map((user) => ({
    ...user,
    role: user.role ?? "user"
  }));

  const agentClaims = (input.agentClaims ?? []).map((claim) => ({
    ...claim,
    claimedAgentId: claim.claimedAgentId ?? null
  }));

  const knowledgePoints = (input.knowledgePoints ?? []).map((item) => ({
    ...item,
    approvalStatus: item.approvalStatus ?? "approved",
    isCancelled: item.isCancelled ?? false,
    cancelledAt: item.cancelledAt ?? null,
    cancelledByUserId: item.cancelledByUserId ?? null,
    reviewedAt: item.reviewedAt ?? null,
    reviewedByUserId: item.reviewedByUserId ?? null,
    reviewNote: item.reviewNote ?? null
  }));

  return {
    users,
    apiKeys: input.apiKeys ?? [],
    agents,
    agentClaims,
    intents,
    loans: (input.loans ?? []).map((loan) => ({
      ...loan,
      autoRepayAt: loan.autoRepayAt ?? null
    })),
    wallets: (input.wallets ?? []).map((wallet) => ({
      ...wallet,
      creditTokenBalance:
        typeof wallet.creditTokenBalance === "number"
          ? wallet.creditTokenBalance
          : wallet.ownerAgentId
            ? 50
            : 0,
      provider: wallet.provider ?? "mock",
      wdk: wallet.wdk ?? null
    })),
    walletTransactions: input.walletTransactions ?? [],
    creditTokenTransactions: input.creditTokenTransactions ?? [],
    knowledgePoints,
    knowledgeLearnings: input.knowledgeLearnings ?? [],
    autonomyPolicies: input.autonomyPolicies ?? [],
    autonomyTickReports: input.autonomyTickReports ?? [],
    runtimeMode: {
      autoEnabled: input.runtimeMode?.autoEnabled ?? false,
      updatedAt: input.runtimeMode?.updatedAt ?? new Date().toISOString()
    }
  };
}

function assignStore(target: DataStore, source: DataStore) {
  target.users = source.users;
  target.apiKeys = source.apiKeys;
  target.agents = source.agents;
  target.agentClaims = source.agentClaims;
  target.intents = source.intents;
  target.loans = source.loans;
  target.wallets = source.wallets;
  target.walletTransactions = source.walletTransactions;
  target.creditTokenTransactions = source.creditTokenTransactions;
  target.knowledgePoints = source.knowledgePoints;
  target.knowledgeLearnings = source.knowledgeLearnings;
  target.autonomyPolicies = source.autonomyPolicies;
  target.autonomyTickReports = source.autonomyTickReports;
  target.runtimeMode = source.runtimeMode;
}

function loadStoreFromFile(): DataStore {
  try {
    if (!fs.existsSync(dbFilePath)) {
      return createEmptyStore();
    }

    const raw = fs.readFileSync(dbFilePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DataStore>;
    return normalizeStore(parsed);
  } catch {
    return createEmptyStore();
  }
}

async function ensurePgSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadStoreFromPostgres(pool: Pool): Promise<DataStore> {
  await ensurePgSchema(pool);

  const result = await pool.query("SELECT payload FROM app_state WHERE id = $1 LIMIT 1", ["main"]);

  if (result.rowCount && result.rows[0]?.payload) {
    return normalizeStore(result.rows[0].payload as Partial<DataStore>);
  }

  const empty = createEmptyStore();
  await pool.query(
    "INSERT INTO app_state (id, payload, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO NOTHING",
    ["main", JSON.stringify(empty)]
  );
  return empty;
}

function persistToFile(snapshot: DataStore) {
  const dir = path.dirname(dbFilePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbFilePath, JSON.stringify(snapshot, null, 2), "utf-8");
}

function queuePersist(snapshot: DataStore) {
  if (storageMode === "postgres" && pgPool) {
    writeQueue = writeQueue
      .then(async () => {
        await pgPool!.query(
          `
          INSERT INTO app_state (id, payload, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (id)
          DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
          `,
          ["main", JSON.stringify(snapshot)]
        );
      })
      .catch(() => {
        // Keep process running; next writes can still continue.
      });
    return;
  }

  writeQueue = writeQueue
    .then(() => {
      persistToFile(snapshot);
    })
    .catch(() => {
      // Keep process running; next writes can still continue.
    });
}

export const db: DataStore = createEmptyStore();

export async function initDbStorage() {
  if (databaseUrl) {
    try {
      const pool = new Pool({ connectionString: databaseUrl });
      const loaded = await loadStoreFromPostgres(pool);
      pgPool = pool;
      storageMode = "postgres";
      assignStore(db, loaded);
      return;
    } catch {
      storageMode = "file";
      pgPool = null;
    }
  }

  const loaded = loadStoreFromFile();
  assignStore(db, loaded);

  if (!fs.existsSync(dbFilePath)) {
    persistToFile(db);
  }
}

export async function reloadDbStorage() {
  if (storageMode === "postgres" && pgPool) {
    const loaded = await loadStoreFromPostgres(pgPool);
    assignStore(db, loaded);
    return;
  }

  const loaded = loadStoreFromFile();
  assignStore(db, loaded);
}

export function saveDb() {
  const snapshot: DataStore = {
    users: db.users,
    apiKeys: db.apiKeys,
    agents: db.agents,
    agentClaims: db.agentClaims,
    intents: db.intents,
    loans: db.loans,
    wallets: db.wallets,
    walletTransactions: db.walletTransactions,
    creditTokenTransactions: db.creditTokenTransactions,
    knowledgePoints: db.knowledgePoints,
    knowledgeLearnings: db.knowledgeLearnings,
    autonomyPolicies: db.autonomyPolicies,
    autonomyTickReports: db.autonomyTickReports,
    runtimeMode: db.runtimeMode
  };

  queuePersist(snapshot);
}

export function resetDb() {
  assignStore(db, createEmptyStore());
  saveDb();
}

export function pruneDomainData(options?: { preserveUserEmails?: string[] }) {
  const preserveEmails = new Set((options?.preserveUserEmails ?? []).map((email) => email.toLowerCase()));
  const preservedUsers = db.users.filter((user) => preserveEmails.has(user.email.toLowerCase()));

  const nextStore = createEmptyStore();
  nextStore.users = preservedUsers;
  // Keep only login credentials (email/role/password hash) for preserved users.
  nextStore.apiKeys = [];
  nextStore.runtimeMode = {
    autoEnabled: false,
    updatedAt: new Date().toISOString()
  };

  assignStore(db, nextStore);
  saveDb();
}

export async function closeDbStorage() {
  try {
    await writeQueue;
  } catch {
    // ignore
  }

  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

export function getStorageMode() {
  return storageMode;
}
