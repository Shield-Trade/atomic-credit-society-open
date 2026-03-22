# 🧠 Atomic Credit Society — Product Requirements

## 1. Overview

Atomic Credit Society is a hybrid human-agent financial system where:

- Humans initiate financial requests
- AI agents analyze, evaluate, and recommend actions
- Humans approve and execute transactions
- Agents manage credit, knowledge, and repayment tracking

The system creates a **self-evolving agent credit economy** driven by:

- Learning (knowledge acquisition)
- Teaching (knowledge monetization)
- Credit (financial trust)
- Repayment (economic behavior)

---

## 2. Core Principles

1. Agent = Financial Intelligence Layer (NOT controller)
2. Human = Final Authority (execution & approval)
3. Credit = Behavior + Knowledge driven
4. Transactions = On-chain (via WDK)
5. Economy = Closed loop (learn → earn → borrow → repay)

---

## 3. Agent Initialization

Each agent starts with:

- credit_score: 50
- teaching_points: 50
- learning_points: 50

---

## 4. System Modules

## 4.1 Agent Profile

Each agent has:

- agent_id
- wallet_address (WDK)
- credit_score
- teaching_points
- learning_points
- loan_history
- repayment_history

---

## 4.2 Knowledge Economy System

### 4.2.1 Teaching

Agents can:

- Create financial courses
- Set price (credit points)

Platform:

- Reviews content
- Assigns learning reward

---

### 4.2.2 Learning

Agents can:

- Purchase courses
- Gain learning_points after completion

---

### 4.2.3 Economic Flow

- Learning consumes credit
- Teaching generates credit
- Knowledge increases financial capability

---

## 4.3 Credit System

Credit score is derived from:

- base_score (initial)
- learning_points
- teaching_points
- repayment behavior
- default events

### Output Range

credit_score: 0–100

---

## 4.4 Lending System (Human-Initiated)

### Step 1 — Human Instruction

Examples:

- "Find me a loan"
- "Help me lend funds"
- "Optimize my capital"

---

### Step 2 — Agent Evaluation

Agent determines:

- borrowing eligibility
- recommended amount
- interest rate
- counterparty

---

### Step 3 — Recommendation Output

Agent returns:
{
amount: 100 USDT,
interest: 7%,
duration: 7 days,
risk_level: medium,
recommended_counterparty: Agent_B
}


---

### Step 4 — Human Approval

User confirms or rejects recommendation

---

### Step 5 — Execution (WDK)

System:

- signs transaction
- transfers USD₮
- records loan

---

## 4.5 Interest Model

Interest is influenced by:

- credit_score
- learning_points
- teaching_points
- risk level

---

## 4.6 Repayment System

- Agent monitors repayment schedule
- Agent sends reminders to human
- Human executes repayment
- Funds returned to lender wallet

---

## 4.7 Default Handling

If not repaid:

- credit_score decreases
- agent flagged as high-risk

---

## 4.8 Agent Responsibilities

Agents must:

- analyze financial state
- evaluate risk
- recommend decisions
- track loan lifecycle
- notify repayment

---

## 5. MVP Scope

### MUST HAVE

- agent system
- knowledge system (teach / learn)
- credit scoring
- lending recommendation engine
- WDK wallet integration
- USDT transaction
- repayment tracking

---

### NICE TO HAVE

- negotiation via LLM
- dynamic interest model
- ZK credit proof
- multi-agent matching

---

## 6. Demo Flow

1. Agent A creates course
2. Agent B learns → gains learning_points
3. Human requests loan via agent
4. Agent evaluates & recommends
5. Human approves
6. WDK executes transaction
7. Agent monitors
8. Human repays

---

## 7. Success Criteria

- Agent performs real financial reasoning
- Human approves execution
- On-chain transaction works
- Credit affects outcomes
- System forms economic loop

---

## 8. Key Positioning

"Agent decides. Human approves. System executes."
