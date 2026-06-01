"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import type { SignPlacement } from "@/lib/types";

interface PropertyMarkerProps {
  placement?: SignPlacement;
  selected?: boolean;
  onSelect?: (placement: SignPlacement) => void;
}

export function PropertyMarker({ placement, selected, onSelect }: PropertyMarkerProps) {
  if (!placement) {
    return null;
  }

  return (
    <AdvancedMarker position={{ lat: placement.lat, lng: placement.lng }} onClick={() => onSelect?.(placement)}>
      <div
        className={`grid size-9 place-items-center rounded-full bg-[#DC2626] text-sm font-bold text-white shadow-lg transition ${
          selected ? "scale-[1.2] ring-4 ring-white" : ""
        }`}
      >
        ⌂
      </div>
    </AdvancedMarker>
  );
}
