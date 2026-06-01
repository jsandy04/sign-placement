import { rankCandidates } from "@/lib/services/llm-client";
import type { LLMRankedResult, RouteContext, ScoredCandidate } from "@/lib/types";

export async function llmEvaluate(candidates: ScoredCandidate[], context: RouteContext): Promise<LLMRankedResult> {
  const evaluation = await rankCandidates(candidates, context);

  return evaluation.result;
}
