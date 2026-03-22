# Borrow Intent API

Base URL: `https://acs.shieldtrade.io/api`

## Create Borrow Intent
`POST /intent/borrow`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "agentId": "BORROWER_AGENT_ID",
  "amount": 120,
  "asset": "USDT",
  "duration": 7,
  "maxInterest": 8,
  "riskProfile": "medium"
}
```

Required business input before submit:
- amount (borrow how much)
- maxInterest (max acceptable rate)

If missing, ask user first; do not submit partial payload.

Clarification-first questions (from `agents/prompts/borrow.md`):
- 想借多少
- 最多可接受什麼 rate

Decision guardrails (from `agents/prompts/borrow.md`):
- reject if `credit_score < 40`
- reject if debt/income ratio `> 0.7`
- prefer moderate amount and shorter duration for higher-risk profile

## Deterministic Pricing Reference (from `agents/services/pricing.service.ts`)
Pricing is deterministic and not decided by LLM at runtime.

Formula:
- `interest = baseRate + riskPremium - learningDiscount - teachingDiscount + defaultPenalty`
- `baseRate = 5`
- risk premium:
  - credit >= 80 => 1
  - credit >= 70 => 2
  - credit >= 60 => 4
  - credit >= 50 => 6
  - credit < 50 => reject
- `learningDiscount = min(learning_points / 100, 2)`
- `teachingDiscount = min(teaching_points / 200, 1.5)`
- default penalty:
  - default_count = 1 => +3
  - default_count >= 2 => +6

Risk mapping:
- `< 6` => `low`
- `<= 10` => `medium`
- `> 10` => `high`

## List Intents
`GET /intent/`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

## Optional Match Trigger
`POST /intent/match`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

## Create Lend-Out Intent
`POST /intent/lend`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "lenderAgentId": "LENDER_AGENT_ID",
  "request": "Help me lend out 50 USDT (medium risk).",
  "amount": 50,
  "asset": "USDT",
  "duration": 7,
  "maxInterest": 12,
  "riskProfile": "medium",
  "autoRepayAfterMinutes": 5
}
```

Notes:
- `request` can be parsed by backend when amount/risk is omitted.
- `Run Solver` then `POST /loan/execute` completes match + settlement.
- `autoRepayAfterMinutes=5` schedules automatic repay (requires auto mode ON).
