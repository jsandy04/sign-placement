"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { InputPanel } from "@/components/input/InputPanel";
import { MapView } from "@/components/map/MapView";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useStreetView } from "@/hooks/useStreetView";
import type { SignPlacement } from "@/lib/types";

export default function Home() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  return (
    <APIProvider apiKey={apiKey} libraries={["places", "streetview"]}>
      <AnalysisWorkspace />
    </APIProvider>
  );
}

function AnalysisWorkspace() {
  const analysis = useAnalysis();
  const placements = analysis.result?.placements ?? [];
  const streetView = useStreetView(placements);

  function selectPlacement(placement: SignPlacement) {
    streetView.openStreetView(placement);
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 text-zinc-950 lg:flex-row">
      <InputPanel
        address={analysis.address}
        signCount={analysis.signCount}
        loading={analysis.loading}
        hasResult={Boolean(analysis.result)}
        error={analysis.error}
        progressLabel={analysis.progressLabel}
        onAddressChange={analysis.setAddress}
        onSignCountChange={analysis.setSignCount}
        onSubmit={analysis.analyze}
        onNewAnalysis={analysis.reset}
      />
      <MapView
        result={analysis.result}
        loading={analysis.loading}
        error={analysis.error}
        selectedPlacement={streetView.selectedPlacement}
        streetViewHeading={streetView.heading}
        streetViewLoading={streetView.loading}
        streetViewAvailable={streetView.available}
        onSelectPlacement={selectPlacement}
        onPreviousStreetView={streetView.previous}
        onNextStreetView={streetView.next}
      />
      <ResultsPanel
        result={analysis.result}
        loading={analysis.loading}
        progressLabel={analysis.progressLabel}
        selectedPlacement={streetView.selectedPlacement}
        streetViewAvailability={streetView.availability}
        onSelectPlacement={selectPlacement}
        onStreetView={streetView.openStreetView}
      />
    </div>
  );
}
