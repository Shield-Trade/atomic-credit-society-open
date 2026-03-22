"use client";

import { useMemo, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, LinkIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { DashboardShell } from "@/components/DashboardShell";
import { apiClient } from "@/lib/api-client";

interface AgentRow {
  id: string;
  name: string;
  walletAddress: string;
  creditScore: number;
  knowledgeScore: number;
  teachingScore: number;
  defaultEvents: number;
  isDisabled: boolean;
}

interface Policy {
  autoBorrowEnabled: boolean;
  autoRepayEnabled: boolean;
  borrowMaxAmount: number;
  borrowMaxInterest: number;
  allowedRiskProfiles: Array<"low" | "medium" | "high">;
  updatedAt: string;
}

interface BorrowIntent {
  id: string;
  borrowerId: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  durationDays: number;
  maxInterest: number;
  riskProfile: "low" | "medium" | "high";
  status: "open" | "solving" | "matched" | "rejected" | "expired";
  matchedLenderId: string | null;
}

interface Loan {
  id: string;
  borrowerId: string;
  lenderId: string;
  intentId: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  interestRate: number;
  durationDays: number;
  status: "active" | "repaid" | "defaulted";
  dueAt: string;
  totalRepaid: number;
  createdAt: string;
}

interface Settlement {
  transactionId: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  asset: "USDT" | "USAT" | "XAUT" | "BTC";
  signature: string;
  onChainTxHash: string;
  timestamp: string;
}

interface FinanceDecision {
  decision: "approve" | "reject";
  approved_amount: number;
  risk_level: "low" | "medium" | "high";
}

interface PricingBreakdown {
  approved: boolean;
  baseRate: number;
  riskPremium: number;
  knowledgeDiscount: number;
  teachingDiscount: number;
  defaultPenalty: number;
  interestRate: number;
  riskLevel: "low" | "medium" | "high";
}

interface StepResult {
  key: number;
  title: string;
  ok: boolean;
  detail: string;
  keyword: string;
  keywordClassName: string;
  payload?: string;
  txHash?: string;
  explorerUrl?: string;
}

const EXPLORER_TX_BASE = process.env.NEXT_PUBLIC_EXPLORER_TX_BASE_URL ?? "https://sepolia.etherscan.io/tx/";

function shortId(id: string) {
  return id.slice(0, 8) + "...";
}

function fmtDate(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function explorerTxUrl(hash: string | null | undefined) {
  if (!hash || !hash.startsWith("0x")) {
    return "";
  }
  return EXPLORER_TX_BASE + hash;
}

function describeTxHash(hash: string) {
  if (hash.startsWith("0x")) {
    return {
      label: "Real On-chain Tx",
      className: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
      note: "Executed by real WDK EVM transfer module."
    };
  }

  if (hash.startsWith("chain_")) {
    return {
      label: "Mock WDK Tx",
      className: "border-amber-300/30 bg-amber-400/10 text-amber-200",
      note: "This is a simulated tx id from mock provider, not a blockchain address."
    };
  }

  return {
    label: "Unknown Tx Format",
    className: "border-slate-300/30 bg-white/10 text-slate-200",
    note: "Unable to classify tx hash format."
  };
}

function resolveRiskPremium(creditScore: number) {
  if (creditScore >= 80) {
    return 1;
  }
  if (creditScore >= 70) {
    return 2;
  }
  if (creditScore >= 60) {
    return 4;
  }
  if (creditScore >= 50) {
    return 6;
  }
  return NaN;
}

function resolveRiskLevel(rate: number): "low" | "medium" | "high" {
  if (rate < 6) {
    return "low";
  }
  if (rate <= 10) {
    return "medium";
  }
  return "high";
}

function calculatePricing(agent: AgentRow): PricingBreakdown {
  const baseRate = 5;
  const riskPremium = resolveRiskPremium(agent.creditScore);
  const knowledgeDiscount = Math.min(agent.knowledgeScore / 100, 2);
  const teachingDiscount = Math.min(agent.teachingScore / 200, 1.5);
  const defaultPenalty = agent.defaultEvents >= 2 ? 6 : agent.defaultEvents === 1 ? 3 : 0;

  if (!Number.isFinite(riskPremium)) {
    return {
      approved: false,
      baseRate,
      riskPremium: 0,
      knowledgeDiscount,
      teachingDiscount,
      defaultPenalty,
      interestRate: 0,
      riskLevel: "high"
    };
  }

  const interestRate = Number((baseRate + riskPremium - knowledgeDiscount - teachingDiscount + defaultPenalty).toFixed(2));

  return {
    approved: true,
    baseRate,
    riskPremium,
    knowledgeDiscount,
    teachingDiscount,
    defaultPenalty,
    interestRate,
    riskLevel: resolveRiskLevel(interestRate)
  };
}

function StepPill({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] " +
        (ok
          ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
          : "border-rose-300/30 bg-rose-400/15 text-rose-200")
      }
    >
      {ok ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <XCircleIcon className="h-3.5 w-3.5" />}
      {text}
    </span>
  );
}

export default function AgentFinanceDemoPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<StepResult[]>([]);

  const tokenMissing = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !localStorage.getItem("token");
  }, []);

  async function ensureTwoAgents() {
    const fetchAgents = async () => {
      const data = await apiClient.get<{ agents: AgentRow[] }>("/agent/");
      return data.agents.filter((item) => !item.isDisabled);
    };

    let current = await fetchAgents();
    while (current.length < 2) {
      await apiClient.post("/agent/create", {
        name: `Finance Demo Agent ${Date.now().toString().slice(-6)}`
      });
      current = await fetchAgents();
    }

    return current;
  }

  async function resolveAgentBalance(agent: AgentRow, asset: "USDT" | "USAT" | "XAUT" | "BTC" = "USDT") {
    const data = await apiClient.get<{ walletAddress: string; asset: string; balance: number }>(
      `/wallet/balance?walletAddress=${encodeURIComponent(agent.walletAddress)}&asset=${asset}`
    );

    return {
      agent,
      balance: data.balance
    };
  }

  async function runFlow() {
    setLoading(true);
    setError("");
    setStatus("");

    const stepRows: StepResult[] = [];

    try {
      await apiClient.post("/agent/demo/bootstrap", { runAutonomy: false }).catch(() => null);

      const agents = await ensureTwoAgents();
      const balances = await Promise.all(agents.map((agent) => resolveAgentBalance(agent)));
      balances.sort((a, b) => b.balance - a.balance);

      const lender = balances[0];
      const borrower = balances.find((row) => row.agent.id !== lender.agent.id);

      if (!borrower) {
        throw new Error("Unable to resolve borrower/lender pair for demo flow.");
      }

      const requestedAmount = 500;
      const requestedRisk: "medium" = "medium";

      stepRows.push({
        key: 1,
        title: "STEP 1 | User Request",
        keyword: "REQUEST",
        keywordClassName: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
        ok: true,
        detail: `Request accepted for ${borrower.agent.name}. Borrow request: ${requestedAmount} USDT (${requestedRisk} risk).`,
        payload: JSON.stringify(
          {
            request: "Help me lend out 500 USDT (medium risk).",
            borrowerAgent: borrower.agent.name,
            candidateLender: lender.agent.name
          },
          null,
          2
        )
      });

      const approvedAmount = Number(Math.max(0, Math.min(200, Number(lender.balance.toFixed(2)))).toFixed(2));
      const decision: FinanceDecision = {
        decision: approvedAmount > 0 ? "approve" : "reject",
        approved_amount: approvedAmount,
        risk_level: requestedRisk
      };

      stepRows.push({
        key: 2,
        title: "STEP 2 | Agent Decision",
        keyword: "DECISION",
        keywordClassName: "border-violet-300/30 bg-violet-400/10 text-violet-100",
        ok: decision.decision === "approve" && decision.approved_amount > 0,
        detail:
          decision.decision === "approve"
            ? `Approved amount ${decision.approved_amount} USDT based on lender available balance ${lender.balance.toFixed(2)} USDT.`
            : "Rejected: lender liquidity is zero.",
        payload: JSON.stringify(decision, null, 2)
      });

      if (decision.decision !== "approve" || decision.approved_amount <= 0) {
        throw new Error("Agent decision rejected due to insufficient lender liquidity.");
      }

      const pricing = calculatePricing(borrower.agent);
      const pricingFormula = `${pricing.baseRate}% base + ${pricing.riskPremium}% risk - ${pricing.knowledgeDiscount.toFixed(2)}% knowledge - ${pricing.teachingDiscount.toFixed(2)}% teaching + ${pricing.defaultPenalty}% default = ${pricing.interestRate.toFixed(2)}%`;

      stepRows.push({
        key: 3,
        title: "STEP 3 | Pricing Engine",
        keyword: "PRICING",
        keywordClassName: "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-100",
        ok: pricing.approved,
        detail: `Interest calculated: ${pricingFormula}`,
        payload: JSON.stringify(
          {
            borrowerAgent: borrower.agent.name,
            borrowerProfile: {
              creditScore: borrower.agent.creditScore,
              knowledgeScore: borrower.agent.knowledgeScore,
              teachingScore: borrower.agent.teachingScore,
              defaultEvents: borrower.agent.defaultEvents
            },
            pricing
          },
          null,
          2
        )
      });

      if (!pricing.approved) {
        throw new Error("Pricing engine rejected borrower profile.");
      }

      const policyResponse = await apiClient.post<{ policy: Policy }>("/agent/policy", {
        autoBorrowEnabled: true,
        autoRepayEnabled: true,
        borrowMaxAmount: 200,
        borrowMaxInterest: 12,
        allowedRiskProfiles: ["low", "medium"]
      });
      const policy = policyResponse.policy;

      const policyPass =
        policy.autoBorrowEnabled &&
        decision.approved_amount <= policy.borrowMaxAmount &&
        pricing.interestRate <= policy.borrowMaxInterest &&
        policy.allowedRiskProfiles.includes(decision.risk_level);

      stepRows.push({
        key: 4,
        title: "STEP 4 | Policy Engine",
        keyword: "POLICY",
        keywordClassName: "border-sky-300/30 bg-sky-400/10 text-sky-100",
        ok: policyPass,
        detail: policyPass
          ? `Policy passed. max_per_loan=${policy.borrowMaxAmount}, risk_limit=${policy.allowedRiskProfiles.join(",")}, max_interest=${policy.borrowMaxInterest}%.`
          : `Policy blocked. amount=${decision.approved_amount}, interest=${pricing.interestRate}%, risk=${decision.risk_level}.`,
        payload: JSON.stringify(
          {
            policy: {
              max_per_loan: policy.borrowMaxAmount,
              risk_limit: policy.allowedRiskProfiles,
              max_interest: policy.borrowMaxInterest,
              auto_borrow_enabled: policy.autoBorrowEnabled,
              auto_repay_enabled: policy.autoRepayEnabled
            },
            evaluation: {
              amount: decision.approved_amount,
              offeredInterest: pricing.interestRate,
              risk: decision.risk_level,
              pass: policyPass
            }
          },
          null,
          2
        )
      });

      if (!policyPass) {
        throw new Error("Policy engine blocked this transaction.");
      }

      const maxInterest = Number(Math.max(pricing.interestRate + 0.5, pricing.interestRate).toFixed(2));
      const borrowRes = await apiClient.post<{ intent: BorrowIntent }>("/intent/borrow", {
        agentId: borrower.agent.id,
        amount: decision.approved_amount,
        asset: "USDT",
        duration: 7,
        maxInterest,
        riskProfile: decision.risk_level
      });

      const matchRes = await apiClient.post<{
        intentId: string;
        matchedLenderId: string;
        offeredInterest: number;
        reason: string;
        autoSettlement?: {
          autoSettled: boolean;
          skippedReason: string | null;
          execution: {
            loan: Loan;
            settlement: Settlement | null;
            reused: boolean;
          } | null;
        } | null;
      }>("/intent/match", {
        intentId: borrowRes.intent.id
      });

      const executeRes = matchRes.autoSettlement?.autoSettled && matchRes.autoSettlement.execution
        ? matchRes.autoSettlement.execution
        : await apiClient.post<{
            loan: Loan;
            settlement: Settlement | null;
            reused: boolean;
          }>("/loan/execute", {
            intentId: borrowRes.intent.id
          });

      const executeTxHash = executeRes.settlement?.onChainTxHash ?? "";
      const executeExplorer = explorerTxUrl(executeTxHash);

      stepRows.push({
        key: 5,
        title: "STEP 5 | Auto Execute (WDK)",
        keyword: "EXECUTION",
        keywordClassName: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
        ok: !!executeRes.loan,
        detail: executeExplorer
          ? "Loan executed. Real tx submitted and explorer link is available."
          : "Loan executed, but tx hash is not EVM-format (likely mock provider).",
        payload: JSON.stringify(
          {
            intentId: borrowRes.intent.id,
            matchedLenderId: matchRes.matchedLenderId,
            offeredInterest: matchRes.offeredInterest,
            loanId: executeRes.loan.id,
            txHash: executeTxHash || null
          },
          null,
          2
        ),
        txHash: executeTxHash || undefined,
        explorerUrl: executeExplorer || undefined
      });

      const totalDue = Number((executeRes.loan.amount * (1 + executeRes.loan.interestRate / 100)).toFixed(2));
      const outstanding = Number((totalDue - executeRes.loan.totalRepaid).toFixed(2));

      const borrowerBalance = await apiClient.get<{ walletAddress: string; asset: string; balance: number }>(
        `/wallet/balance?walletAddress=${encodeURIComponent(borrower.agent.walletAddress)}&asset=${executeRes.loan.asset}`
      );

      const reminder = `Reminder sent: loan ${shortId(executeRes.loan.id)} due at ${fmtDate(executeRes.loan.dueAt)}. Outstanding ${outstanding} ${executeRes.loan.asset}.`;

      if (borrowerBalance.balance >= outstanding && outstanding > 0) {
        const repayRes = await apiClient.post<{
          loan: Loan;
          settlement: Settlement;
          outstanding: number;
        }>("/loan/repay", {
          loanId: executeRes.loan.id,
          amount: outstanding
        });

        const repayHash = repayRes.settlement?.onChainTxHash ?? "";
        const repayExplorer = explorerTxUrl(repayHash);

        stepRows.push({
          key: 6,
          title: "STEP 6 | Repayment",
          keyword: "REPAYMENT",
          keywordClassName: "border-rose-300/30 bg-rose-400/10 text-rose-100",
          ok: repayRes.loan.status === "repaid" || repayRes.outstanding <= 0,
          detail: `${reminder} Auto repay executed because balance is sufficient (${borrowerBalance.balance.toFixed(2)} ${executeRes.loan.asset}).`,
          payload: JSON.stringify(
            {
              reminder,
              borrowerBalance: borrowerBalance.balance,
              repayAmount: outstanding,
              loanStatus: repayRes.loan.status,
              remainingOutstanding: repayRes.outstanding
            },
            null,
            2
          ),
          txHash: repayHash || undefined,
          explorerUrl: repayExplorer || undefined
        });
      } else {
        stepRows.push({
          key: 6,
          title: "STEP 6 | Repayment",
          keyword: "REPAYMENT",
          keywordClassName: "border-rose-300/30 bg-rose-400/10 text-rose-100",
          ok: false,
          detail: `${reminder} Auto repay skipped: insufficient balance (${borrowerBalance.balance.toFixed(2)} < ${outstanding.toFixed(2)}).`,
          payload: JSON.stringify(
            {
              reminder,
              borrowerBalance: borrowerBalance.balance,
              requiredForRepay: outstanding,
              action: "wait_for_topup_then_repay"
            },
            null,
            2
          )
        });
      }

      setResults(stepRows);
      setStatus("Agent Finance demo completed. Test plan and execution results are shown below.");
    } catch (err) {
      setResults(stepRows);
      setError(err instanceof Error ? err.message : "Agent Finance demo failed.");
    } finally {
      setLoading(false);
    }
  }

  if (tokenMissing) {
    return (
      <section className="surface-card p-6 text-sm text-slate-100">
        Token not found. Please login at <a href="/auth" className="text-primary underline">/auth</a> first.
      </section>
    );
  }

  return (
    <DashboardShell
      section="demo-agent-finance"
      title="Demo: Agent Finance"
      subtitle="End-to-end test flow: request -> decision -> pricing -> policy -> WDK execution -> repayment."
      actions={
        <button className="btn-secondary" type="button" onClick={runFlow} disabled={loading}>
          <ArrowPathIcon className="mr-1 h-4 w-4" />
          {loading ? "Running..." : "Run Full Demo"}
        </button>
      }
    >
      {status ? <p className="mb-3 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{status}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

      <article className="surface-card p-5">
        <h2 className="text-base font-semibold text-white">Test Plan</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-200">
          <li>User request: Help me lend out 500 USDT (medium risk).</li>
          <li>Agent decision output JSON (approve/reject, approved amount, risk).</li>
          <li>Pricing engine computes real interest from borrower profile.</li>
          <li>Policy engine checks max-per-loan, risk limit, and max interest.</li>
          <li>If passed, auto execute via WDK and return tx hash + explorer link.</li>
          <li>Agent sends repayment reminder, then auto repay when balance is sufficient.</li>
        </ol>
      </article>

      <article className="surface-card mt-5 p-5">
        <h2 className="text-base font-semibold text-white">Scenario Input</h2>
        <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-amber-200">STEP 1</p>
          <p className="mt-2 text-sm text-slate-100">Help me lend out 500 USDT (medium risk).</p>
        </div>
      </article>

      <article className="surface-card mt-5 p-5">
        <h2 className="text-base font-semibold text-white">Execution Result</h2>
        <div className="mt-4 space-y-3">
          {results.length === 0 ? <p className="text-sm text-slate-300">No run yet.</p> : null}
          {results.map((row) => (
            <div key={row.key} className="surface-card-soft p-4 text-xs text-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className={"rounded-full border px-2 py-1 text-[10px] uppercase " + row.keywordClassName}>
                    {row.keyword}
                  </span>
                  {row.title}
                </p>
                <StepPill ok={row.ok} text={row.ok ? "PASS" : "FAIL"} />
              </div>
              <p className="mt-2 text-slate-300">{row.detail}</p>
              {row.payload ? (
                <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] text-slate-200">
                  {row.payload}
                </pre>
              ) : null}
              {row.txHash ? (
                <div className="mt-2">
                  <p className="text-[11px] text-slate-300">
                    tx hash: <span className="text-slate-100">{row.txHash}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-300">
                    {(() => {
                      const txMeta = describeTxHash(row.txHash);
                      return (
                        <span className={"inline-flex items-center rounded-full border px-2 py-0.5 " + txMeta.className}>
                          {txMeta.label}
                        </span>
                      );
                    })()}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">{describeTxHash(row.txHash).note}</p>
                </div>
              ) : null}
              {row.explorerUrl ? (
                <a
                  href={row.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary underline"
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  View on explorer
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </article>
    </DashboardShell>
  );
}
