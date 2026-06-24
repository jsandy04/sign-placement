import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock, ContentBlockParam, Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import type { CornerVerdict, StrategistBriefing, StrategistDecision } from "@/lib/types";
import type { StreetViewImage } from "./google-maps";

// The LLM is the strategist now — it judges which approaches matter, the per-property strategy, and
// which corners to sign (Stage A), and reads Street View to judge each corner (Stage B). Geometry is
// deterministic and lives elsewhere. See docs/reframe-llm-strategist.md.
// Model is env-configurable so cost vs. judgment quality is a knob, not a redeploy. Default to the
// cheapest capable multimodal model — both stages must READ Street View images, so a vision model is
// required (this rules out cheap text-only models like DeepSeek). Bump to claude-sonnet-4-6 or
// claude-opus-4-8 via SIGN_PLACEMENT_MODEL when a property needs sharper judgment. Note the ~$0.12
// Maps cost per analysis (8 discovery rays + Street View stills) is the real floor regardless of model.
const MODEL = process.env.SIGN_PLACEMENT_MODEL ?? "claude-haiku-4-5";
const MAX_TOKENS = 8_000;
const ATTEMPTS = 3;

// Adaptive thinking + the effort knob exist only on Opus 4.6+/Sonnet 4.6/Fable 5 — Haiku 4.5 rejects
// them (400). Attach them only when the chosen model supports them, so the cheap default still works.
// (Opus 4.8 also rejects `temperature`, so repeatability comes from caching the analysis per address.)
const SUPPORTS_EFFORT = /opus-4-[678]|sonnet-4-6|fable-5/.test(MODEL);
function reasoningParams() {
  return SUPPORTS_EFFORT
    ? { thinking: { type: "adaptive" as const }, output_config: { effort: "high" as const } }
    : {};
}

// === Stage A: which approaches matter + which corners get a sign ===

export const STRATEGIST_SYSTEM_PROMPT = `You are an expert real-estate open-house sign strategist. A realtor gives you a property, a sign budget, and the genuine approach routes a driver could take to reach it — each with its road name, the direction traffic comes from, its length, its speed, and the turns along it. Your job is to decide, like a sharp agent who (unlike a real agent at 6am) has all the time in the world to scout, which approaches are worth signing and exactly which turns get a sign, to get the most buyers to the open house.

GOAL: maximize the chance that a driver trying to find the house actually finds it. Signs form an unbroken breadcrumb trail from a busy feeder road to the front door. If a driver reaches a turn with no sign, the trail is broken and they give up.

HOW TO THINK:
- Prioritize the busiest / most natural approaches first — higher speed and an arterial-sounding road name signal more traffic exposure — but use judgment: a slightly slower road everyone actually uses beats a fast road nobody approaches from.
- Only fund approaches the budget can make FOLLOWABLE. A followable approach needs an ENTRY sign where the driver leaves the arterial, a sign at EACH genuine wrong-way turn, and a CONFIRMATION near the destination. Minimum signs for an approach = 2 + (its signable turns). Never open an approach you can't make followable — a half-signed route is worse than not signing it at all.
- Concentrate vs. spread is a per-property judgment, not a fixed rule. One deep, solid route usually beats two skeletal ones. Open a second or third approach only when the budget covers each at its followable minimum AND it captures genuinely different traffic. Three approaches is a practical ceiling — more reads as spammy and most cities cap sign counts.
- Always saturate the near-house block: a sign or two within the final ~1/8 mile (plus the mandatory sign AT the property) serves every approach at once — the highest value per sign.
- Opposite directions on the same arterial (e.g. northbound vs southbound) are TWO distinct approaches — half your audience never sees a one-direction sign.

PROPERTY-TYPE ADAPTATIONS:
- Property directly ON an arterial with no neighborhood turn-in: use few signs — an advance "open house ahead" sign in each direction of travel plus the property sign. Do not invent neighborhood turns.
- Rural / nearest arterial far away: fewer, wider-spaced signs at the major turns; the trail can be long.
- Apartment / condo / gated community: the destination is the leasing office, building lobby, or gate — sign the gate and internal forks, and note that management permission is required.

PLACEMENT RULES (the agent applies the exact geometry; you only choose WHICH turns get a sign):
- One sign per turn — never two for the same turn.
- The sign goes BEFORE the turn, never exactly at the corner (sight-triangle hazard, illegal in most places).
- The final sign is always AT the property.

OUTPUT: call decide_sign_strategy. Reference each chosen sign by its decision_point_id from the briefing — never invent coordinates or roads. Spend the budget wisely but don't pad it: signage ROI is real but modest (only ~4% of buyers find a home via signs), so a clean followable trail beats a spectacle. Write each rationale in plain, confident language for a busy agent.`;

const ROLE_ENUM = ["entry", "turn", "confirmation", "near-house", "property"] as const;

const strategyTool: Tool = {
  name: "decide_sign_strategy",
  description: "Return the chosen approaches, per-property strategy, and the signs to place (by decision_point_id).",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      strategy_summary: { type: "string" },
      property_type: { type: "string" },
      chosen_approaches: { type: "array", items: { type: "integer" } },
      signs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            decision_point_id: { type: "string" },
            approach_index: { type: "integer" },
            role: { type: "string", enum: [...ROLE_ENUM] },
            rationale: { type: "string" },
            order: { type: "integer" },
          },
          required: ["decision_point_id", "approach_index", "role", "rationale", "order"],
        },
      },
    },
    required: ["strategy_summary", "property_type", "chosen_approaches", "signs"],
  },
};

export async function runStrategist(briefing: StrategistBriefing): Promise<StrategistDecision> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });
  let healing = "";
  let lastError: unknown;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        ...reasoningParams(),
        system:STRATEGIST_SYSTEM_PROMPT,
        tools: [strategyTool],
        tool_choice: { type: "tool", name: strategyTool.name },
        messages: [
          {
            role: "user",
            content: JSON.stringify({ briefing, schema_error_to_fix: healing || undefined }),
          },
        ],
      });

      return parseStrategy(message.content);
    } catch (error) {
      lastError = error;
      healing = error instanceof Error ? error.message : "Output did not match the schema.";
      if (attempt < ATTEMPTS) {
        await sleep(Math.min(1_500 * 2 ** (attempt - 1), 30_000));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Strategist call failed");
}

function parseStrategy(content: ContentBlock[]): StrategistDecision {
  const toolUse = content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Strategist did not return the decide_sign_strategy tool call");
  }

  const input = toolUse.input as Partial<StrategistDecision>;
  if (
    typeof input.strategy_summary !== "string" ||
    typeof input.property_type !== "string" ||
    !Array.isArray(input.chosen_approaches) ||
    !Array.isArray(input.signs)
  ) {
    throw new Error("Strategist tool input is missing required fields");
  }

  for (const sign of input.signs) {
    if (
      typeof sign.decision_point_id !== "string" ||
      typeof sign.approach_index !== "number" ||
      typeof sign.role !== "string" ||
      typeof sign.order !== "number"
    ) {
      throw new Error("Strategist signs contains an invalid item");
    }
  }

  return input as StrategistDecision;
}

// === Stage B: read each corner's Street View image and judge whether it's a good spot ===

export const VISION_SYSTEM_PROMPT = `You are scouting candidate open-house sign corners from Street View, the way a realtor would at 6am deciding where to stake each sign. Each image is shot facing the direction a driver approaches the corner from.

For each corner, judge whether it's a good place to plant a temporary yard sign:
- Line of sight: can an approaching driver actually see a sign here, with enough lead time to react?
- Room to place it: is there a verge, shoulder, or grass setback to stake the sign off the pavement — not in the roadway or balanced on a narrow curb?
- Hazards: fire hydrant, bus stop, crosswalk, utility box/pedestal, a median or traffic island (signs are illegal on medians), construction, or a view blocked by parked cars, foliage, or walls.

Be practical, not perfectionist — an ordinary residential corner with a grass strip is a good spot. Mark a corner unusable only when there's a real problem. Call judge_corners with one verdict per corner, keyed by the decision_point_id you were given.`;

const cornerTool: Tool = {
  name: "judge_corners",
  description: "Return one verdict per candidate sign corner.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            decision_point_id: { type: "string" },
            usable: { type: "boolean" },
            confidence: { type: "number" },
            hazards: { type: "array", items: { type: "string" } },
            note: { type: "string" },
          },
          required: ["decision_point_id", "usable", "confidence", "hazards", "note"],
        },
      },
    },
    required: ["verdicts"],
  },
};

export interface CornerInput {
  decisionPointId: string;
  role: string;
  roadName?: string;
  image: StreetViewImage;
}

export async function judgeCorners(corners: CornerInput[]): Promise<CornerVerdict[]> {
  if (corners.length === 0) {
    return [];
  }

  const client = new Anthropic({ apiKey: getAnthropicApiKey() });
  const content: ContentBlockParam[] = [
    {
      type: "text",
      text: "Judge each of the following candidate open-house sign corners. Each is labeled with its decision_point_id; return a verdict for every one.",
    },
  ];

  for (const corner of corners) {
    content.push({
      type: "text",
      text: `Corner ${corner.decisionPointId} — role: ${corner.role}${corner.roadName ? `, on ${corner.roadName}` : ""}, facing the driver's approach:`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: corner.image.mediaType, data: corner.image.data },
    });
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        ...reasoningParams(),
        system:VISION_SYSTEM_PROMPT,
        tools: [cornerTool],
        tool_choice: { type: "tool", name: cornerTool.name },
        messages: [{ role: "user", content }],
      });

      return parseVerdicts(message.content);
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) {
        await sleep(Math.min(1_500 * 2 ** (attempt - 1), 30_000));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Vision pass failed");
}

function parseVerdicts(content: ContentBlock[]): CornerVerdict[] {
  const toolUse = content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Vision pass did not return the judge_corners tool call");
  }

  const input = toolUse.input as { verdicts?: unknown };
  if (!Array.isArray(input.verdicts)) {
    throw new Error("Vision tool input is missing verdicts");
  }

  return input.verdicts.map((raw) => {
    const verdict = raw as Partial<CornerVerdict>;
    if (typeof verdict.decision_point_id !== "string" || typeof verdict.usable !== "boolean") {
      throw new Error("Vision verdict is invalid");
    }
    return {
      decision_point_id: verdict.decision_point_id,
      usable: verdict.usable,
      confidence: typeof verdict.confidence === "number" ? verdict.confidence : 0.5,
      hazards: Array.isArray(verdict.hazards) ? verdict.hazards : [],
      note: typeof verdict.note === "string" ? verdict.note : "",
      imageAvailable: true,
    };
  });
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
