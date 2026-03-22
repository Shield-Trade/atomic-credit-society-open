


interest_rate = base_rate 
              + risk_premium(credit_score)
              - knowledge_discount(learning_points)
              - trust_discount(teaching_points)
              + behavior_penalty(default_history)

Example Code:

function calculateInterest(agent) {
  const base = 5;

  let risk = 0;
  if (agent.credit >= 80) risk = 1;
  else if (agent.credit >= 70) risk = 2;
  else if (agent.credit >= 60) risk = 4;
  else if (agent.credit >= 50) risk = 6;
  else return null;

  const learningDiscount = Math.min(agent.learning / 100, 2);
  const teachingDiscount = Math.min(agent.teaching / 200, 1.5);

  let penalty = 0;
  if (agent.default === 1) penalty = 3;
  if (agent.default >= 2) penalty = 6;

  return base + risk - learningDiscount - teachingDiscount + penalty;
}