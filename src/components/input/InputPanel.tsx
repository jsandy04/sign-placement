"use client";

import { useState } from "react";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { SignCountSelector } from "./SignCountSelector";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

interface InputPanelProps {
  address: string;
  signCount: number;
  loading: boolean;
  hasResult: boolean;
  error?: string;
  progressLabel: string;
  onAddressChange: (value: string) => void;
  onSignCountChange: (value: number) => void;
  onSubmit: () => void;
  onNewAnalysis: () => void;
}

export function InputPanel({
  address,
  signCount,
  loading,
  hasResult,
  error,
  progressLabel,
  onAddressChange,
  onSignCountChange,
  onSubmit,
  onNewAnalysis,
}: InputPanelProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  if (hasResult && !loading) {
    return (
      <aside className="fixed left-4 top-4 z-30 lg:static lg:h-screen lg:w-[280px] lg:border-r lg:border-zinc-200 lg:bg-white lg:p-4">
        <Button type="button" variant="secondary" className="w-full" onClick={onNewAnalysis}>
          New Analysis
        </Button>
      </aside>
    );
  }

  return (
    <aside className="fixed left-4 top-4 z-30 lg:static lg:h-screen lg:w-[280px] lg:border-r lg:border-zinc-200 lg:bg-white lg:p-4">
      <Button
        type="button"
        variant="primary"
        className="lg:hidden"
        onClick={() => setMobileOpen((value) => !value)}
      >
        Analyze
      </Button>
      <div
        className={`mt-3 w-[calc(100vw-2rem)] max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-xl transition lg:mt-0 lg:block lg:w-auto lg:max-w-none lg:border-0 lg:p-0 lg:shadow-none ${
          mobileOpen || loading ? "block" : "hidden"
        }`}
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-800">Address</label>
          <AddressAutocomplete value={address} disabled={loading} onChange={onAddressChange} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-800">Signs</label>
          <SignCountSelector value={signCount} disabled={loading} onChange={onSignCountChange} />
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={loading}
          onClick={() => {
            setMobileOpen(false);
            onSubmit();
          }}
        >
          {loading ? <Spinner /> : null}
          {loading ? progressLabel : "Analyze"}
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </aside>
  );
}
