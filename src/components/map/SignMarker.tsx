"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import type { PlacementType, SignPlacement } from "@/lib/types";

interface SignMarkerProps {
  placement: SignPlacement;
  selected: boolean;
  onSelect: (placement: SignPlacement) => void;
}

const colors: Record<PlacementType, string> = {
  intersection: "bg-[#2563EB] text-white",
  entrance: "bg-[#16A34A] text-white",
  midroute: "bg-[#D97706] text-black",
  roundabout: "bg-[#7C3AED] text-white",
  property: "bg-[#DC2626] text-white",
};

export function SignMarker({ placement, selected, onSelect }: SignMarkerProps) {
  if (placement.placementType === "property") {
    return null;
  }

  const flagged = placement.flag !== "none";
  const color = flagged ? "bg-[#EA580C] text-white" : colors[placement.placementType];

  return (
    <AdvancedMarker position={{ lat: placement.lat, lng: placement.lng }} onClick={() => onSelect(placement)}>
      <div
        className={`grid size-8 place-items-center rounded-full text-sm font-bold shadow-lg transition ${color} ${
          selected ? "scale-[1.2] ring-4 ring-white" : ""
        }`}
      >
        {flagged ? "!" : placement.sortOrder}
      </div>
    </AdvancedMarker>
  );
}
