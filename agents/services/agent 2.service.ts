import fs from "fs";
import path from "path";

// 👉 這裡你可以換成 OpenAI / Ollama / OpenClaw API
async function callLLM(prompt: string) {
  // placeholder（你之後接 API）
  return {
    decision: "approve",
    reason: "Mock response",
    recommendation: {
      amount: 100,
      duration_days: 7,
      risk_level: "medium"
    }
  };
}

function loadPrompt(file: string) {
  const filePath = path.join(__dirname, "../agents/prompts", file);
  return fs.readFileSync(filePath, "utf-8");
}

function buildPrompt(task: string, input: any) {
  const system = loadPrompt("master.md");
  const taskPrompt = loadPrompt(`${task}.md`);

  return `
${system}

${taskPrompt}

INPUT:
${JSON.stringify(input, null, 2)}
`;
}

// ✅ 主入口
export async function runAgent(task: "borrow" | "lend" | "credit" | "repay", input: any) {
  const prompt = buildPrompt(task, input);

  const rawResponse = await callLLM(prompt);

  // 👉 可加 JSON validation
  return rawResponse;
}