import fs from "fs";

function loadPrompt(path: string) {
  return fs.readFileSync(path, "utf-8");
}

export function runAgent(task: string, input: any) {
  const system = loadPrompt("./agents/prompts/master.md");
  const taskPrompt = loadPrompt(`./agents/prompts/${task}.md`);

  const finalPrompt = `
${system}

${taskPrompt}

INPUT:
${JSON.stringify(input)}
`;

  return callLLM(finalPrompt);
}