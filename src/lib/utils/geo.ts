import type { LatLng } from "@/lib/types";

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_FOOT = 0.3048;
const FEET_PER_METER = 1 / METERS_PER_FOOT;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

export function metersToFeet(meters: number) {
  return meters * FEET_PER_METER;
}

export function feetToMeters(feet: number) {
  return feet * METERS_PER_FOOT;
}

export function haversineDistanceMeters(a: LatLng, b: LatLng) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function haversineDistanceFeet(a: LatLng, b: LatLng) {
  return metersToFeet(haversineDistanceMeters(a, b));
}

export function bearingDegrees(a: LatLng, b: LatLng) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLng = toRadians(b.lng - a.lng);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function bearingDeltaDegrees(a: number, b: number) {
  const delta = Math.abs(((b - a + 540) % 360) - 180);

  return delta;
}

export function decodePolyline(polyline: string) {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < polyline.length) {
    const latChange = decodeSignedValue(polyline, index);
    index = latChange.nextIndex;
    lat += latChange.value;

    const lngChange = decodeSignedValue(polyline, index);
    index = lngChange.nextIndex;
    lng += lngChange.value;

    points.push({
      lat: lat / 100_000,
      lng: lng / 100_000,
    });
  }

  return points;
}

function decodeSignedValue(polyline: string, startIndex: number) {
  let index = startIndex;
  let result = 0;
  let shift = 0;
  let byte = 0;

  do {
    byte = polyline.charCodeAt(index) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
    index += 1;
  } while (byte >= 0x20);

  return {
    value: result & 1 ? ~(result >> 1) : result >> 1,
    nextIndex: index,
  };
}

export function pointToLineDistanceFeet(point: LatLng, lineStart: LatLng, lineEnd: LatLng) {
  const projected = projectPointToLine(point, lineStart, lineEnd);

  return haversineDistanceFeet(point, projected);
}

function projectPointToLine(point: LatLng, lineStart: LatLng, lineEnd: LatLng) {
  const meanLat = toRadians((lineStart.lat + lineEnd.lat) / 2);
  const pointXY = toLocalXY(point, lineStart, meanLat);
  const endXY = toLocalXY(lineEnd, lineStart, meanLat);
  const lengthSquared = endXY.x * endXY.x + endXY.y * endXY.y;

  if (lengthSquared === 0) {
    return lineStart;
  }

  const t = Math.max(
    0,
    Math.min(1, (pointXY.x * endXY.x + pointXY.y * endXY.y) / lengthSquared),
  );

  return {
    lat: lineStart.lat + (lineEnd.lat - lineStart.lat) * t,
    lng: lineStart.lng + (lineEnd.lng - lineStart.lng) * t,
  };
}

function toLocalXY(point: LatLng, origin: LatLng, meanLat: number) {
  return {
    x: toRadians(point.lng - origin.lng) * Math.cos(meanLat) * EARTH_RADIUS_METERS,
    y: toRadians(point.lat - origin.lat) * EARTH_RADIUS_METERS,
  };
}
