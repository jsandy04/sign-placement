"use client";

import { useCallback, useMemo, useState } from "react";
import type { AnalyzeInput, SignPlacementResult } from "@/lib/types";

const steps = [
  "Geocoding address",
  "Finding approach roads",
  "Computing routes",
  "Generating candidates",
  "Filtering placements",
  "Ranking with LLM",
  "Selecting signs",
  "Saving result",
];

export function useAnalysis() {
  const [address, setAddress] = useState("");
  const [signCount, setSignCount] = useState(5);
  const [result, setResult] = useState<SignPlacementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [stepIndex, setStepIndex] = useState(0);

  const progressLabel = useMemo(() => `Step ${Math.min(stepIndex + 1, steps.length)}/8: ${steps[stepIndex]}`, [stepIndex]);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setResult(null);
    setStepIndex(0);

    const interval = window.setInterval(() => {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }, 1_500);

    try {
      const input: AnalyzeInput = { address, signCount };
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.message ?? "Something went wrong. Please try again.");
        return;
      }

      setResult(body as SignPlacementResult);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      window.clearInterval(interval);
      setLoading(false);
      setStepIndex(0);
    }
  }, [address, signCount]);

  const reset = useCallback(() => {
    setResult(null);
    setError(undefined);
  }, []);

  return {
    address,
    signCount,
    result,
    loading,
    error,
    progressLabel,
    setAddress,
    setSignCount,
    analyze,
    setResult,
    reset,
  };
}
