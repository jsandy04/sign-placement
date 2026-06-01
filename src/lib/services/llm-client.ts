import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock, Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import type { LLMEvaluationResult, LLMRankedResult, RouteContext, ScoredCandidate } from "@/lib/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2_000;
const TEMPERATURE = 0.2;
const LLM_ATTEMPTS = 3;

export const SIGN_PLACEMENT_SYSTEM_PROMPT = `You are an expert real estate sign placement strategist. Signs form a directional trail from the nearest major road to the property. You will receive pre-scored candidate sign locations for each turn along the route.

Rules:
1. One sign per turn. Select exactly one sign for each turn.
2. Place signs BEFORE the turn, not at the turn.
3. High-traffic intersections are most valuable — prioritize candidates at or near major intersections.
4. Final sign must be at the property address.
5. All candidates have been pre-validated for code compliance, physical feasibility, and spatial constraints. Do NOT re-check these.
6. Space selected signs well apart — do not select two signs within 100 feet of each other unless they serve different turns.
7. If no candidate adequately serves a given turn, flag the gap rather than forcing a suboptimal selection.

Scoring methodology: Each candidate has been scored on decision-point criticality (30%), traffic volume (25%), visibility quality (20%), approach speed alignment (15%), and sign spacing (10%). Understand these weights when evaluating the pre-scored list. Prefer higher-scored candidates but override when you identify qualitative factors the scoring missed.`;

const rankCandidatesTool: Tool = {
  name: "rank_sign_candidates",
  description: "Return the selected open house sign placements and reasoning.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      overall_assessment: { type: "string" },
      selected_signs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            turn_number: { type: "integer" },
            candidate_id: { type: "string" },
            rationale: { type: "string" },
            confidence: { type: "number" },
            flagged_alternatives: { type: "array", items: { type: "string" } },
          },
          required: ["turn_number", "candidate_id", "rationale", "confidence"],
        },
      },
      gaps_or_warnings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            turn_number: { type: "integer" },
            issue: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["turn_number", "issue"],
        },
      },
      route_coherence_check: {
        type: "object",
        properties: {
          passes: { type: "boolean" },
          notes: { type: "string" },
        },
        required: ["passes", "notes"],
      },
    },
    required: ["overall_assessment", "selected_signs", "gaps_or_warnings", "route_coherence_check"],
  },
};

export async function rankCandidates(
  candidates: ScoredCandidate[],
  context: RouteContext,
): Promise<LLMEvaluationResult> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });
  let healingMessage = "";
  let lastError: unknown;

  for (let attempt = 1; attempt <= LLM_ATTEMPTS; attempt += 1) {
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: SIGN_PLACEMENT_SYSTEM_PROMPT,
        tools: [rankCandidatesTool],
        tool_choice: { type: "tool", name: "rank_sign_candidates" },
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              context,
              candidates,
              schema_error_to_fix: healingMessage || undefined,
            }),
          },
        ],
      });
      const result = parseToolUse(message.content);

      return {
        result,
        cost: 0,
      };
    } catch (error) {
      lastError = error;
      healingMessage = error instanceof Error ? error.message : "Structured output did not match the schema.";

      if (attempt < LLM_ATTEMPTS) {
        await sleep(Math.min(1_500 * 2 ** (attempt - 1), 30_000));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("LLM ranking failed");
}

function parseToolUse(content: ContentBlock[]) {
  const toolUse = content.find((block) => block.type === "tool_use");

  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return the required ranking tool call");
  }

  return validateLLMRankedResult(toolUse.input);
}

function validateLLMRankedResult(input: unknown): LLMRankedResult {
  if (!input || typeof input !== "object") {
    throw new Error("LLM tool input must be an object");
  }

  const result = input as Partial<LLMRankedResult>;

  if (
    typeof result.overall_assessment !== "string" ||
    !Array.isArray(result.selected_signs) ||
    !Array.isArray(result.gaps_or_warnings) ||
    !result.route_coherence_check ||
    typeof result.route_coherence_check.passes !== "boolean" ||
    typeof result.route_coherence_check.notes !== "string"
  ) {
    throw new Error("LLM tool input is missing required fields");
  }

  for (const sign of result.selected_signs) {
    if (
      typeof sign.turn_number !== "number" ||
      typeof sign.candidate_id !== "string" ||
      typeof sign.rationale !== "string" ||
      typeof sign.confidence !== "number"
    ) {
      throw new Error("LLM selected_signs contains an invalid item");
    }
  }

  for (const warning of result.gaps_or_warnings) {
    if (typeof warning.turn_number !== "number" || typeof warning.issue !== "string") {
      throw new Error("LLM gaps_or_warnings contains an invalid item");
    }
  }

  return result as LLMRankedResult;
}

function getAnthropicApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  return key;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
