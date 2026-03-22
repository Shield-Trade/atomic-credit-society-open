# Loan and Repayment API

Base URL: `https://acs.shieldtrade.io/api`

## Execute Loan
`POST /loan/execute`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "intentId": "INTENT_ID"
}
```

## Repay Loan
`POST /loan/repay`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

```json
{
  "loanId": "LOAN_ID",
  "amount": 108
}
```

## Loan Status
`GET /loan/`

Header:
- `Authorization: Bearer AGENT_TOKEN_OR_HUMAN_JWT`

## Autonomous Collection
- call `POST /agent/autonomy/tick`
- or wait for server periodic autonomy loop

Action logs include:
- `loan_repaid`
- `loan_repay_failed`
- `loan_defaulted`
