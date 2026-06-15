"use client";

import { Polyline } from "@vis.gl/react-google-maps";

type RouteVariant = "primary" | "funded" | "available";

interface RoutePolylineProps {
  encodedPath?: string;
  // "primary" = the lead funded route (bold blue); "funded" = a secondary route that has signs
  // (lighter solid); "available" = a discovered approach the budget couldn't fund (faded dashed).
  variant?: RouteVariant;
}

const STYLES: Record<RouteVariant, { strokeColor: string; strokeOpacity: number; strokeWeight: number }> = {
  primary: { strokeColor: "#2563EB", strokeOpacity: 0.85, strokeWeight: 5 },
  funded: { strokeColor: "#60A5FA", strokeOpacity: 0.6, strokeWeight: 3 },
  available: { strokeColor: "#94A3B8", strokeOpacity: 0.35, strokeWeight: 2 },
};

export function RoutePolyline({ encodedPath, variant = "primary" }: RoutePolylineProps) {
  if (!encodedPath) {
    return null;
  }

  const style = STYLES[variant];

  return (
    <Polyline
      encodedPath={encodedPath}
      strokeColor={style.strokeColor}
      strokeOpacity={style.strokeOpacity}
      strokeWeight={style.strokeWeight}
    />
  );
}
