import { GeocodeError, geocode as geocodeAddress } from "@/lib/services/google-maps";
import type { GeocodedAddress } from "@/lib/types";
import { normalizeAddress } from "@/lib/utils/format";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const STREET_ADDRESS_TYPES = new Set(["street_address", "premise", "subpremise"]);
const cache = new Map<string, { value: GeocodedAddress; expiresAt: number }>();

export { GeocodeError };

export async function geocode(address: string): Promise<GeocodedAddress> {
  const key = normalizeAddress(address);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const result = await geocodeAddress(address);

  if (result.partialMatch && !result.resultTypes?.some((type) => STREET_ADDRESS_TYPES.has(type))) {
    console.warn("Geocoding returned a partial match below street-address precision.");
  }

  cache.set(key, {
    value: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return result;
}
