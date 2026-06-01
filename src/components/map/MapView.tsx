"use client";

import { Map, RenderingType } from "@vis.gl/react-google-maps";
import { PropertyMarker } from "./PropertyMarker";
import { RoutePolyline } from "./RoutePolyline";
import { SignMarker } from "./SignMarker";
import { StreetViewPanel } from "./StreetViewPanel";
import { useMapBounds } from "@/hooks/useMapBounds";
import type { SignPlacement, SignPlacementResult } from "@/lib/types";

const PHOENIX_CENTER = { lat: 33.4484, lng: -112.074 };

interface MapViewProps {
  result: SignPlacementResult | null;
  loading: boolean;
  error?: string;
  selectedPlacement?: SignPlacement;
  streetViewHeading: number;
  streetViewLoading: boolean;
  streetViewAvailable: boolean;
  onSelectPlacement: (placement: SignPlacement) => void;
  onPreviousStreetView: () => void;
  onNextStreetView: () => void;
}

export function MapView({
  result,
  loading,
  error,
  selectedPlacement,
  streetViewHeading,
  streetViewLoading,
  streetViewAvailable,
  onSelectPlacement,
  onPreviousStreetView,
  onNextStreetView,
}: MapViewProps) {
  const placements = result?.placements ?? [];
  const property = placements.find((placement) => placement.placementType === "property");
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

  useMapBounds(placements, result?.route.polyline);

  return (
    <main className="relative flex min-h-screen flex-1 flex-col bg-zinc-100 lg:h-screen">
      {error ? (
        <div className="absolute left-4 right-4 top-4 z-20 rounded-md bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/70">
          <div className="size-12 animate-pulse rounded-full bg-[#2563EB]" />
        </div>
      ) : null}
      <div className={selectedPlacement ? "h-screen lg:h-[60%] lg:min-h-[320px]" : "h-screen lg:h-full lg:min-h-[520px]"}>
        <Map
          mapId={mapId}
          renderingType={RenderingType.VECTOR}
          defaultCenter={PHOENIX_CENTER}
          defaultZoom={11}
          gestureHandling="greedy"
          disableDefaultUI={false}
          className="h-full w-full"
        >
          <RoutePolyline encodedPath={result?.route.polyline} />
          {placements.map((placement) => (
            <SignMarker
              key={placement.id}
              placement={placement}
              selected={selectedPlacement?.id === placement.id}
              onSelect={onSelectPlacement}
            />
          ))}
          <PropertyMarker
            placement={property}
            selected={Boolean(property && selectedPlacement?.id === property.id)}
            onSelect={onSelectPlacement}
          />
        </Map>
      </div>
      {selectedPlacement ? (
        <div className="fixed inset-0 z-40 bg-zinc-950 lg:static lg:h-[40%] lg:min-h-[260px]">
          <StreetViewPanel
            placement={selectedPlacement}
            heading={streetViewHeading}
            loading={streetViewLoading}
            available={streetViewAvailable}
            onPrevious={onPreviousStreetView}
            onNext={onNextStreetView}
          />
        </div>
      ) : null}
    </main>
  );
}
