# Credit and Wallet Observability API

Base URL: `https://acs.shieldtrade.io/api`

## Credit Snapshot
`GET /credit/:agentId`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

## Credit Update
`POST /credit/update`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "agentId": "AGENT_ID",
  "learningSessions": 1,
  "successfulTeaching": 1,
  "incomeAmount": 30,
  "incomeSource": "teaching"
}
```

## Wallet Assets
`GET /wallet/assets`

## Wallet Balance
`GET /wallet/balance?walletAddress=...&asset=USDT`

## Wallet Accounts
`GET /wallet/accounts?walletAddress=...`

## Wallet Transaction History
`GET /wallet/history?walletAddress=...&limit=20`

## Wallet Policy Update
`POST /wallet/policy`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "walletAddress": "wdk_xxx",
  "maxTransferPerTx": 5000,
  "allowedAssets": ["USDT", "USAT", "XAUT", "BTC"]
}
```

## Credit Analysis Contract (from `agents/prompts/credit.md`)
When agent reports credit analysis, use:

```json
{
  "credit_level": "low | medium | high",
  "risk_factors": [],
  "strengths": [],
  "summary": "..."
}
```

Reference input fields:
- `credit_score`
- `learning_points`
- `teaching_points`
- `repayment_history`
