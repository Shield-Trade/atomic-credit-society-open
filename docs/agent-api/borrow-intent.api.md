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
