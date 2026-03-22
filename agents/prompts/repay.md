# TASK: REPAYMENT REMINDER

Generate reminder for user.

---

# INPUT

- loan_amount: {{amount}}
- due_date: {{due_date}}
- days_remaining: {{days}}

---

# OUTPUT

{
  "urgency": "low" | "medium" | "high",
  "message": "..."
}