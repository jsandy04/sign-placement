import { Spinner } from "@/components/ui/Spinner";

interface PipelineProgressProps {
  label: string;
}

export function PipelineProgress({ label }: PipelineProgressProps) {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-3 h-4 w-2/3 animate-pulse rounded bg-zinc-200" />
          <div className="h-3 w-full animate-pulse rounded bg-zinc-100" />
        </div>
      ))}
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Spinner />
        {label}
      </div>
    </div>
  );
}
