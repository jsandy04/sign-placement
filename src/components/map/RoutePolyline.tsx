"use client";

import { Polyline } from "@vis.gl/react-google-maps";

interface RoutePolylineProps {
  encodedPath?: string;
  primary?: boolean;
}

export function RoutePolyline({ encodedPath, primary = true }: RoutePolylineProps) {
  if (!encodedPath) {
    return null;
  }

  return (
    <Polyline
      encodedPath={encodedPath}
      strokeColor={primary ? "#2563EB" : "#60A5FA"}
      strokeOpacity={primary ? 0.85 : 0.5}
      strokeWeight={primary ? 5 : 3}
    />
  );
}
