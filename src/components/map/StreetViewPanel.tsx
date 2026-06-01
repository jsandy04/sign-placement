"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { SignPlacement } from "@/lib/types";

interface StreetViewPanelProps {
  placement?: SignPlacement;
  heading: number;
  loading: boolean;
  available: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function StreetViewPanel({
  placement,
  heading,
  loading,
  available,
  onPrevious,
  onNext,
}: StreetViewPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);

  useEffect(() => {
    if (!placement || !available || !containerRef.current || !window.google?.maps) {
      return;
    }

    const position = { lat: placement.lat, lng: placement.lng };

    if (!panoramaRef.current) {
      panoramaRef.current = new google.maps.StreetViewPanorama(containerRef.current, {
        addressControl: false,
        fullscreenControl: false,
        motionTracking: false,
        panControl: true,
        zoomControl: true,
      });
    }

    panoramaRef.current.setPosition(position);
    panoramaRef.current.setPov({ heading, pitch: 0 });
  }, [available, heading, placement]);

  if (!placement) {
    return null;
  }

  return (
    <section className="relative h-full min-h-[260px] border-t border-zinc-200 bg-zinc-950 text-white">
      <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
        <div className="rounded-md bg-black/70 px-3 py-2 text-sm">
          <div className="font-semibold">Sign #{placement.sortOrder}</div>
          <div className="text-xs text-zinc-300">Heading {Math.round(heading)}°</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="h-8 px-3" onClick={onPrevious}>
            ◀
          </Button>
          <Button type="button" variant="secondary" className="h-8 px-3" onClick={onNext}>
            ▶
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="grid h-full min-h-[260px] place-items-center">
          <Spinner />
        </div>
      ) : available ? (
        <div ref={containerRef} className="h-full min-h-[260px] w-full" />
      ) : (
        <div className="grid h-full min-h-[260px] place-items-center px-6 text-center text-sm text-zinc-300">
          Street View unavailable at this location
        </div>
      )}
    </section>
  );
}
