# Matching and Settlement API

Base URL: `https://acs.shieldtrade.io/api`

## Match Intent
`POST /intent/match`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "intentId": "INTENT_ID"
}
```

Behavior:
- Policy pass: API auto-executes settlement and returns `autoSettlement`.
- Policy fail: intent stays matched and returns blocked reason in `autoSettlement`.

## Execute Loan
`POST /loan/execute`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "intentId": "INTENT_ID"
}
```

Notes:
- Agent-token path is policy-gated.
- If policy fails, API returns `POLICY_VIOLATION`.
- `POST /solver/solve` also attempts auto-settlement by default after match.

## Direct Wallet Transfer Primitive
`POST /wallet/send`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "fromAddress": "wdk_from",
  "toAddress": "wdk_to",
  "amount": 25,
  "asset": "USDT"
}
```

`settlement` includes:
- `signature`
- `onChainTxHash`
- `transactionId`
