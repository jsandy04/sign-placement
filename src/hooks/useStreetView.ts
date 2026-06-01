"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApiIsLoaded } from "@vis.gl/react-google-maps";
import type { SignPlacement } from "@/lib/types";

export function useStreetView(placements: SignPlacement[]) {
  const [selectedPlacement, setSelectedPlacement] = useState<SignPlacement>();
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [loadingPlacementId, setLoadingPlacementId] = useState<string>();
  const apiLoaded = useApiIsLoaded();

  const heading = useMemo(() => selectedPlacement?.approachBearing ?? 0, [selectedPlacement]);

  useEffect(() => {
    if (!apiLoaded || !window.google?.maps || placements.length === 0) {
      return;
    }

    const service = new google.maps.StreetViewService();

    placements.forEach((placement) => {
      service.getPanorama(
        {
          location: { lat: placement.lat, lng: placement.lng },
          radius: 75,
          source: google.maps.StreetViewSource.OUTDOOR,
        },
        (_data, status) => {
          setAvailability((current) => ({
            ...current,
            [placement.id]: status === google.maps.StreetViewStatus.OK,
          }));
        },
      );
    });
  }, [apiLoaded, placements]);

  const openStreetView = useCallback((placement: SignPlacement) => {
    setLoadingPlacementId(placement.id);
    setSelectedPlacement(placement);
    window.setTimeout(() => setLoadingPlacementId(undefined), 350);
  }, []);

  const previous = useCallback(() => {
    if (!selectedPlacement || placements.length === 0) {
      return;
    }

    const index = placements.findIndex((placement) => placement.id === selectedPlacement.id);
    const nextIndex = (index - 1 + placements.length) % placements.length;
    openStreetView(placements[nextIndex]);
  }, [openStreetView, placements, selectedPlacement]);

  const next = useCallback(() => {
    if (!selectedPlacement || placements.length === 0) {
      return;
    }

    const index = placements.findIndex((placement) => placement.id === selectedPlacement.id);
    const nextIndex = (index + 1) % placements.length;
    openStreetView(placements[nextIndex]);
  }, [openStreetView, placements, selectedPlacement]);

  return {
    selectedPlacement,
    heading,
    availability,
    loading: Boolean(selectedPlacement && loadingPlacementId === selectedPlacement.id),
    available: selectedPlacement ? availability[selectedPlacement.id] ?? false : false,
    setSelectedPlacement,
    openStreetView,
    previous,
    next,
  };
}
