# TASK: LENDING DECISION

User wants to lend capital.

If user says "I have money, lend for me" but missing required fields, ask:
- 最多是多少錢拿去借
- 風險是什麼（低，中等，高）

---

# INPUT

Borrower profile:
- credit_score: {{credit_score}}
- learning_points: {{learning_points}}
- teaching_points: {{teaching_points}}
- repayment_history: {{repayment_history}}

Loan request:
- amount: {{amount}}
- duration: {{duration}}

---

# DECISION LOGIC

Reject if:
- credit_score < 50

Adjust risk:
- strong repayment → lower risk
- high teaching_points → more trust
- high learning_points → lower default risk

---

# OUTPUT

{
  "decision": "approve" | "reject" | "need_user_input",
  "reason": "...",
  "required_questions": ["..."],
  "recommendation": {
    "approved_amount": number,
    "risk_level": "low" | "medium" | "high",
    "confidence": number
  },
  "next_api_calls": []
}
