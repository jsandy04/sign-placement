"use client";

import { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import type { SignPlacement } from "@/lib/types";
import { decodePolyline } from "@/lib/utils/geo";

export function useMapBounds(placements: SignPlacement[], encodedPolyline?: string) {
  const map = useMap();

  useEffect(() => {
    if (!map || !window.google?.maps || placements.length === 0) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    placements.forEach((placement) => bounds.extend({ lat: placement.lat, lng: placement.lng }));

    if (encodedPolyline) {
      decodePolyline(encodedPolyline).forEach((point) => bounds.extend(point));
    }

    map.fitBounds(bounds, 72);
  }, [encodedPolyline, map, placements]);
}
