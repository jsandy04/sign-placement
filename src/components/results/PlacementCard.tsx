"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ExpandToggle } from "@/components/ui/ExpandToggle";
import type { SignPlacement } from "@/lib/types";

interface PlacementCardProps {
  placement: SignPlacement;
  active: boolean;
  streetViewAvailable: boolean;
  onSelect: (placement: SignPlacement) => void;
  onStreetView: (placement: SignPlacement) => void;
}

export function PlacementCard({
  placement,
  active,
  streetViewAvailable,
  onSelect,
  onStreetView,
}: PlacementCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isProperty = placement.placementType === "property";

  return (
    <Card className={`p-4 transition ${active ? "border-zinc-950 ring-2 ring-zinc-950/10" : ""}`}>
      <button type="button" className="block w-full text-left" onClick={() => onSelect(placement)}>
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-950">Sign #{placement.sortOrder}</div>
            <div className="text-xs capitalize text-zinc-500">{placement.placementType}</div>
          </div>
          {isProperty ? (
            <Badge className="border-zinc-300 bg-zinc-100 text-zinc-800">Mandatory</Badge>
          ) : placement.role ? (
            <Badge className="capitalize">{placement.role.replace("-", " ")}</Badge>
          ) : null}
        </div>
        <p className="text-sm leading-5 text-zinc-700">{placement.description}</p>
      </button>
      {placement.streetViewChecked && (placement.visionNote || (placement.hazards?.length ?? 0) > 0) ? (
        <div
          className={`mt-2 rounded-md border px-3 py-2 text-xs leading-5 ${
            placement.visionUsable === false
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-zinc-200 bg-zinc-50 text-zinc-600"
          }`}
        >
          <span className="font-medium">
            {placement.visionUsable === false ? "⚠ Corner check: " : "Corner check: "}
          </span>
          {placement.visionNote}
          {placement.hazards && placement.hazards.length > 0 ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {placement.hazards.map((hazard) => (
                <span key={hazard} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                  {hazard}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ExpandToggle expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
        {streetViewAvailable ? (
          <Button type="button" variant="secondary" className="h-8 px-3" onClick={() => onStreetView(placement)}>
            Street View
          </Button>
        ) : null}
      </div>
      {expanded ? <p className="mt-3 text-sm leading-5 text-zinc-600">{placement.reasoning}</p> : null}
    </Card>
  );
}
