"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

interface AddressAutocompleteProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

interface Suggestion {
  placeId: string;
  label: string;
  prediction: google.maps.places.PlacePrediction;
}

const DEBOUNCE_MS = 250;

export function AddressAutocomplete({ value, disabled, onChange }: AddressAutocompleteProps) {
  const placesLib = useMapsLibrary("places");
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [debugError, setDebugError] = useState<string | null>(null);

  // Lazily create a session token (one per type-then-select cycle) for correct billing.
  const getSessionToken = useCallback(() => {
    if (!placesLib) {
      return undefined;
    }
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  }, [placesLib]);

  const fetchSuggestions = useCallback(
    async (input: string) => {
      if (input.trim().length < 1) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      if (!placesLib) {
        setDebugError("Places library not loaded (useMapsLibrary returned null).");
        return;
      }
      if (!placesLib.AutocompleteSuggestion) {
        setDebugError("AutocompleteSuggestion is undefined on the loaded Maps version.");
        return;
      }

      const requestId = (requestIdRef.current += 1);

      try {
        setDebugError(null);
        const { suggestions: results } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: getSessionToken(),
            includedRegionCodes: ["us"],
          });

        // Ignore out-of-order responses from earlier keystrokes.
        if (requestId !== requestIdRef.current) {
          return;
        }

        const mapped = results
          .map((result) => result.placePrediction)
          .filter((prediction): prediction is google.maps.places.PlacePrediction => Boolean(prediction))
          .map((prediction) => ({
            placeId: prediction.placeId,
            label: prediction.text?.toString() ?? "",
            prediction,
          }));

        setSuggestions(mapped);
        setActiveIndex(-1);
        setOpen(mapped.length > 0);
      } catch (error) {
        console.error("[autocomplete] fetchAutocompleteSuggestions failed:", error);
        setDebugError(error instanceof Error ? error.message : String(error));
        setSuggestions([]);
        setOpen(false);
      }
    },
    [placesLib, getSessionToken],
  );

  function handleInputChange(next: string) {
    onChange(next);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(next), DEBOUNCE_MS);
  }

  async function selectSuggestion(suggestion: Suggestion) {
    setOpen(false);
    setSuggestions([]);

    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress"] });
      onChange(place.formattedAddress ?? suggestion.label);
    } catch (error) {
      console.error("[autocomplete] fetchFields failed:", error);
      setDebugError(error instanceof Error ? error.message : String(error));
      onChange(suggestion.label);
    } finally {
      // A new session token must be used after a place has been selected.
      sessionTokenRef.current = null;
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      void selectSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        autoFocus
        disabled={disabled}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(suggestions.length > 0)}
        autoComplete="off"
        className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 disabled:bg-zinc-100"
        placeholder="Property address"
      />
      {open && suggestions.length > 0 ? (
        <ul className="absolute left-0 right-0 top-12 z-50 max-h-72 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-xl">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
                className={`block w-full px-3 py-2 text-left text-sm transition ${
                  index === activeIndex ? "bg-zinc-100 text-zinc-950" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {debugError ? (
        <p className="mt-1 text-xs text-red-600">Autocomplete: {debugError}</p>
      ) : null}
    </div>
  );
}
