import { Button } from "./Button";

interface ExpandToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

export function ExpandToggle({ expanded, onToggle }: ExpandToggleProps) {
  return (
    <Button type="button" variant="ghost" className="h-8 px-2" onClick={onToggle}>
      {expanded ? "Hide reasoning" : "Show reasoning"}
    </Button>
  );
}
