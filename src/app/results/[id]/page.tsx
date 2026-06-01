"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import { MapView } from "@/components/map/MapView";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import { useStreetView } from "@/hooks/useStreetView";
import type { SignPlacement, SignPlacementResult } from "@/lib/types";

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const [result, setResult] = useState<SignPlacementResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    async function loadResult() {
      try {
        const response = await fetch(`/api/analyze/${params.id}`);

        if (!response.ok) {
          setError("Result not found.");
          return;
        }

        setResult((await response.json()) as SignPlacementResult);
      } catch {
        setError("Result not found.");
      } finally {
        setLoading(false);
      }
    }

    loadResult();
  }, [params.id]);

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <ResultsWorkspace result={result} loading={loading} error={error} />
    </APIProvider>
  );
}

function ResultsWorkspace({
  result,
  loading,
  error,
}: {
  result: SignPlacementResult | null;
  loading: boolean;
  error?: string;
}) {
  const placements = result?.placements ?? [];
  const streetView = useStreetView(placements);

  function selectPlacement(placement: SignPlacement) {
    streetView.openStreetView(placement);
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 text-zinc-950 lg:flex-row">
      <MapView
        result={result}
        loading={loading}
        error={error}
        selectedPlacement={streetView.selectedPlacement}
        streetViewHeading={streetView.heading}
        streetViewLoading={streetView.loading}
        streetViewAvailable={streetView.available}
        streetViewPanoId={streetView.panoId}
        onSelectPlacement={selectPlacement}
        onPreviousStreetView={streetView.previous}
        onNextStreetView={streetView.next}
      />
      <ResultsPanel
        result={result}
        loading={loading}
        progressLabel="Loading result"
        selectedPlacement={streetView.selectedPlacement}
        streetViewAvailability={streetView.availability}
        onSelectPlacement={selectPlacement}
        onStreetView={streetView.openStreetView}
      />
    </div>
  );
}
