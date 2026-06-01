interface SignCountSelectorProps {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function SignCountSelector({ value, disabled, onChange }: SignCountSelectorProps) {
  return (
    <input
      type="number"
      min={5}
      max={15}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 disabled:bg-zinc-100"
    />
  );
}
