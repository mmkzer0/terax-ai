import { createOpenAI } from "@ai-sdk/openai";
import {
  Experimental_Agent as Agent,
  DirectChatTransport,
  stepCountIs,
} from "ai";
import {
  DEFAULT_MODEL_ID,
  MAX_AGENT_STEPS,
  SYSTEM_PROMPT,
  type ModelId,
} from "../config";
import { buildTools, type ToolContext } from "../tools/tools";

type AgentDeps = {
  apiKey: string;
  modelId?: ModelId;
  toolContext: ToolContext;
  onStep?: (step: string | null) => void;
};

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  read_file: (i) => `Reading ${shortPath(i.path)}`,
  list_directory: (i) => `Listing ${shortPath(i.path)}`,
  write_file: (i) => `Writing ${shortPath(i.path)}`,
  create_directory: (i) => `Creating ${shortPath(i.path)}`,
  run_command: (i) => `Running ${ellipsize(String(i.command ?? ""), 60)}`,
  suggest_command: (i) =>
    `Suggesting ${ellipsize(String(i.command ?? ""), 60)}`,
};

function shortPath(p: unknown): string {
  if (typeof p !== "string") return "";
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function ellipsize(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function createTeraxAgent({
  apiKey,
  modelId = DEFAULT_MODEL_ID,
  toolContext,
  onStep,
}: AgentDeps) {
  const openai = createOpenAI({ apiKey });
  return new Agent({
    model: openai(modelId),
    instructions: SYSTEM_PROMPT,
    tools: buildTools(toolContext),
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    onStepFinish: (step) => {
      if (!onStep) return;
      const last = step.toolCalls?.[step.toolCalls.length - 1];
      if (last) {
        const label = TOOL_LABELS[last.toolName];
        onStep(
          label
            ? label((last.input ?? {}) as Record<string, unknown>)
            : `Calling ${last.toolName}`,
        );
      } else if (step.text) {
        onStep("Writing");
      }
    },
    onFinish: () => {
      onStep?.(null);
    },
  });
}

export type TeraxAgent = ReturnType<typeof createTeraxAgent>;

export function createTeraxTransport(agent: TeraxAgent) {
  return new DirectChatTransport({ agent });
}
