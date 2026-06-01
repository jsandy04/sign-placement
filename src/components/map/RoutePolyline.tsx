"use client";

import { Polyline } from "@vis.gl/react-google-maps";

interface RoutePolylineProps {
  encodedPath?: string;
}

export function RoutePolyline({ encodedPath }: RoutePolylineProps) {
  if (!encodedPath) {
    return null;
  }

  return <Polyline encodedPath={encodedPath} strokeColor="#2563EB" strokeOpacity={0.8} strokeWeight={5} />;
}
