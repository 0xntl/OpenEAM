// The empty state of a whole list: says what belongs here, why it matters,
// and offers the first step. Used once per list page; sections inside a
// page use the smaller EmptyState.
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyCard({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center ${className ?? ''}`}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
