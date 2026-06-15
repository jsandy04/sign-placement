"use client";

import { useState } from "react";
import { PlacementCard } from "./PlacementCard";
import { PipelineProgress } from "./PipelineProgress";
import { Button } from "@/components/ui/Button";
import type { SignPlacement, SignPlacementResult } from "@/lib/types";

interface ResultsPanelProps {
  result: SignPlacementResult | null;
  loading: boolean;
  progressLabel: string;
  selectedPlacement?: SignPlacement;
  streetViewAvailability: Record<string, boolean>;
  onSelectPlacement: (placement: SignPlacement) => void;
  onStreetView: (placement: SignPlacement) => void;
}

export function ResultsPanel({
  result,
  loading,
  progressLabel,
  selectedPlacement,
  streetViewAvailability,
  onSelectPlacement,
  onStreetView,
}: ResultsPanelProps) {
  const [mobileSnap, setMobileSnap] = useState<"peek" | "half" | "full">("half");
  const mobileHeight = {
    peek: "h-20",
    half: "h-[48vh]",
    full: "h-[86vh]",
  }[mobileSnap];

  if (loading) {
    return (
      <aside className="fixed bottom-0 left-0 right-0 z-20 h-[42vh] overflow-y-auto rounded-t-lg border-t border-zinc-200 bg-zinc-50 shadow-2xl lg:static lg:h-screen lg:w-[360px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none">
        <PipelineProgress label={progressLabel} />
      </aside>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <aside
      className={`fixed bottom-0 left-0 right-0 z-20 overflow-y-auto rounded-t-lg border-t border-zinc-200 bg-zinc-50 shadow-2xl transition-all lg:static lg:h-screen lg:w-[360px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none ${mobileHeight}`}
    >
      <div className="space-y-3 p-4">
        <div className="flex justify-center gap-2 lg:hidden">
          {(["peek", "half", "full"] as const).map((snap) => (
            <button
              key={snap}
              type="button"
              className={`h-1.5 w-10 rounded-full ${mobileSnap === snap ? "bg-zinc-950" : "bg-zinc-300"}`}
              onClick={() => setMobileSnap(snap)}
              aria-label={snap}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Placements</h2>
            <p className="text-xs text-zinc-500">{result.placements.length} signs selected</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-3"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/results/${result.id}`)}
          >
            Share
          </Button>
        </div>
        {result.degradationLevel >= 4 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Limited analysis — fewer routes available.
          </div>
        ) : result.degradationLevel === 3 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Detailed descriptions unavailable. Using standard ranking.
          </div>
        ) : result.degradationLevel === 1 ? (
          <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
            2 of 3 routes analyzed
          </div>
        ) : null}
        {result.complianceWarnings && result.complianceWarnings.length > 0 ? (
          <details className="rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900">
            <summary className="cursor-pointer px-3 py-2 font-medium">
              Local rules to verify before placing
            </summary>
            <ul className="list-disc space-y-1 px-7 pb-3 pt-1">
              {result.complianceWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {result.placements.map((placement) => (
          <PlacementCard
            key={placement.id}
            placement={placement}
            active={selectedPlacement?.id === placement.id}
            streetViewAvailable={streetViewAvailability[placement.id] ?? false}
            onSelect={onSelectPlacement}
            onStreetView={onStreetView}
          />
        ))}
        {result.disclaimer ? (
          <p className="border-t border-zinc-200 pt-3 text-[11px] leading-relaxed text-zinc-500">
            {result.disclaimer}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
