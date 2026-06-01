"use client";

import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

interface AddressAutocompleteProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function AddressAutocomplete({ value, disabled, onChange }: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const places = useMapsLibrary("places");

  useEffect(() => {
    if (!places || !inputRef.current) {
      return;
    }

    const autocomplete = new places.Autocomplete(inputRef.current, {
      fields: ["formatted_address"],
      types: ["address"],
    });
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();

      if (place.formatted_address) {
        onChange(place.formatted_address);
      }
    });

    return () => listener.remove();
  }, [onChange, places]);

  return (
    <input
      ref={inputRef}
      autoFocus
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 disabled:bg-zinc-100"
      placeholder="Property address"
    />
  );
}
