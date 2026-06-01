import type { GeocodedAddress, GoogleRoute, LatLng, ManeuverType, RouteStep } from "@/lib/types";
import { decodePolyline } from "@/lib/utils/geo";

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MAPS_RETRY_ATTEMPTS = 3;
const MAPS_RETRY_BASE_MS = 1_000;
const MAPS_RETRY_MAX_MS = 16_000;

export class GeocodeError extends Error {
  constructor(message = "We couldn't find this address. Please check the address and try including the ZIP code.") {
    super(message);
    this.name = "GeocodeError";
  }
}

export class MapsServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapsServiceError";
  }
}

interface GeocodingResponse {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    place_id: string;
    partial_match?: boolean;
    types?: string[];
    geometry: {
      location: LatLng;
    };
  }>;
}

interface RoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: {
      encodedPolyline?: string;
    };
    legs?: Array<{
      steps?: Array<{
        distanceMeters?: number;
        staticDuration?: string;
        navigationInstruction?: {
          maneuver?: string;
          instructions?: string;
        };
        startLocation?: {
          latLng?: LatLng;
        };
        endLocation?: {
          latLng?: LatLng;
        };
        polyline?: {
          encodedPolyline?: string;
        };
      }>;
    }>;
  }>;
}

export async function geocode(address: string): Promise<GeocodedAddress> {
  const key = getGoogleMapsApiKey();
  const params = new URLSearchParams({ address, key });
  const response = await retry(
    () => fetch(`${GEOCODING_URL}?${params.toString()}`),
    MAPS_RETRY_ATTEMPTS,
    MAPS_RETRY_BASE_MS,
    MAPS_RETRY_MAX_MS,
  );
  const data = (await response.json()) as GeocodingResponse;

  if (data.status === "ZERO_RESULTS") {
    throw new GeocodeError();
  }

  if (data.status !== "OK" || data.results.length === 0) {
    throw new MapsServiceError(data.error_message ?? `Geocoding failed with status ${data.status}`);
  }

  const result = data.results[0];

  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
    placeId: result.place_id,
    partialMatch: result.partial_match,
    resultTypes: result.types,
  };
}

export async function computeRoutes(origin: LatLng, destination: LatLng): Promise<GoogleRoute> {
  const key = getGoogleMapsApiKey();
  const response = await retry(
    () =>
      fetch(ROUTES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation,routes.legs.steps.endLocation,routes.legs.steps.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: { location: { latLng: origin } },
          destination: { location: { latLng: destination } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          polylineQuality: "HIGH_QUALITY",
          polylineEncoding: "ENCODED_POLYLINE",
        }),
      }),
    MAPS_RETRY_ATTEMPTS,
    MAPS_RETRY_BASE_MS,
    MAPS_RETRY_MAX_MS,
  );

  const data = (await response.json()) as RoutesResponse;
  const route = data.routes?.[0];

  if (!route) {
    throw new MapsServiceError("Routes API returned no route");
  }

  const polyline = route.polyline?.encodedPolyline ?? "";
  const steps = route.legs?.flatMap((leg) => leg.steps ?? []).map(toRouteStep) ?? [];

  return {
    distance: route.distanceMeters ?? sum(steps.map((step) => step.distance)),
    duration: parseDurationSeconds(route.duration),
    polyline,
    steps,
    polylinePoints: polyline ? decodePolyline(polyline) : steps.flatMap((step) => [step.start, step.end]),
  };
}

function toRouteStep(step: NonNullable<NonNullable<NonNullable<RoutesResponse["routes"]>[number]["legs"]>[number]["steps"]>[number]): RouteStep {
  const start = step.startLocation?.latLng ?? { lat: 0, lng: 0 };
  const end = step.endLocation?.latLng ?? { lat: 0, lng: 0 };

  return {
    start,
    end,
    distance: step.distanceMeters ?? 0,
    duration: parseDurationSeconds(step.staticDuration),
    maneuverType: normalizeManeuver(step.navigationInstruction?.maneuver),
    roadName: extractRoadName(step.navigationInstruction?.instructions),
    polyline: step.polyline?.encodedPolyline,
  };
}

function normalizeManeuver(maneuver?: string): ManeuverType {
  switch (maneuver) {
    case "TURN_LEFT":
      return "turn-left";
    case "TURN_RIGHT":
      return "turn-right";
    case "TURN_SLIGHT_LEFT":
      return "turn-slight-left";
    case "TURN_SLIGHT_RIGHT":
      return "turn-slight-right";
    case "TURN_SHARP_LEFT":
      return "turn-sharp-left";
    case "TURN_SHARP_RIGHT":
      return "turn-sharp-right";
    case "ROUNDABOUT_LEFT":
      return "roundabout-left";
    case "ROUNDABOUT_RIGHT":
      return "roundabout-right";
    case "FORK_LEFT":
      return "fork-left";
    case "FORK_RIGHT":
      return "fork-right";
    case "MERGE":
      return "merge";
    case "NAME_CHANGE":
      return "name-change";
    default:
      return "straight";
  }
}

function extractRoadName(instructions?: string) {
  if (!instructions) {
    return undefined;
  }

  const match = instructions.match(/\b(?:onto|on|toward)\s+([^,]+)/i);

  return match?.[1]?.trim();
}

function parseDurationSeconds(duration?: string) {
  if (!duration) {
    return 0;
  }

  return Number.parseInt(duration.replace("s", ""), 10) || 0;
}

function getGoogleMapsApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!key) {
    throw new MapsServiceError("Missing GOOGLE_MAPS_API_KEY");
  }

  return key;
}

async function retry<T extends Response>(
  operation: () => Promise<T>,
  attempts: number,
  baseDelayMs: number,
  maxDelayMs: number,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await operation();

      if (response.ok) {
        return response;
      }

      lastError = new MapsServiceError(`Google Maps request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new MapsServiceError("Google Maps request failed");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
