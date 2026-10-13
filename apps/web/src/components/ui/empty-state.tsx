// The one way an empty list or section says so. Short, italic, no period —
// it is a state, not a sentence; a hint (what to do about it) may follow.
export function EmptyState({ label, hint }: { label: string; hint?: string }) {
  return (
    <p className="text-xs text-muted-foreground italic">
      {label}
      {hint && <span className="not-italic"> — {hint}</span>}
    </p>
  );
}
