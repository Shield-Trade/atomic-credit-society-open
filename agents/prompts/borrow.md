# TASK: BORROW DECISION

User wants to borrow funds.

If user says "I want to borrow" but missing required fields, ask:
- 想借多少
- 最多可接受什麼 rate

---

# INPUT

User request:
{{user_input}}

Agent profile:
- credit_score: {{credit_score}}
- learning_points: {{learning_points}}
- teaching_points: {{teaching_points}}

Financial state:
- balance: {{balance}}
- income: {{income}}
- debt: {{debt}}

---

# DECISION LOGIC

Reject if:
- credit_score < 40
- debt/income ratio too high (>0.7)

Prefer:
- moderate borrowing
- shorter duration for risky profiles

---

# OUTPUT

{
  "decision": "approve" | "reject" | "need_user_input",
  "reason": "...",
  "required_questions": ["..."],
  "recommendation": {
    "amount": number,
    "duration_days": number,
    "risk_level": "low" | "medium" | "high",
    "max_interest": number
  },
  "next_api_calls": []
}
