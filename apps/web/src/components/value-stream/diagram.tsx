// A value stream as the classic chevron sequence of stages, with the
// capabilities behind the selected stage listed underneath. The chevron row
// is the established notation for value streams, so it stays; everything
// around it follows the detail-page grammar of the rest of the app: a
// TitledCard with a heading that names what is shown, linked rows in the
// shared item style, and an explicit empty state.
//
// The stage row is a tablist: one stage is selected at a time and arrow
// keys move between them, which is both what a keyboard user expects of a
// row of mutually exclusive choices and what a screen reader announces
// sensibly ("Qualify, tab 2 of 5, selected").
import { Link } from '@tanstack/react-router';
import { type KeyboardEvent, useId, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { TitledCard } from '@/components/ui/page-header';
import type { ValueStream, ValueStreamCapability, ValueStreamStage } from '@/lib/entities';
import { cn } from '@/lib/utils';

const ARROW = 18;

function Chevron({
  id,
  panelId,
  label,
  isFirst,
  isLast,
  isSelected,
  onSelect,
}: {
  id: string;
  panelId: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const clipPath = isFirst
    ? `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%)`
    : `polygon(${ARROW}px 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, ${ARROW}px 100%, 0 50%)`;

  return (
    <button
      type="button"
      id={id}
      role="tab"
      aria-selected={isSelected}
      aria-controls={panelId}
      tabIndex={isSelected ? 0 : -1}
      onClick={onSelect}
      onFocus={onSelect}
      style={{
        clipPath,
        marginLeft: isFirst ? 0 : -ARROW,
        paddingLeft: isFirst ? 14 : ARROW + 8,
        paddingRight: isLast ? 14 : ARROW + 8,
        zIndex: isSelected ? 20 : 'auto',
      }}
      // Same grammar as the app's tabs: a muted track, the active item
      // lifted to the full card colour, the others at half so every
      // chevron keeps its silhouette and the row still reads as a
      // sequence. The clip-path eats borders and rings, so selection is
      // carried by fill and weight alone.
      className={cn(
        'relative flex min-h-12 flex-1 cursor-pointer select-none items-center justify-center py-2.5 text-center text-xs leading-snug transition-colors',
        isSelected
          ? 'bg-card font-semibold text-foreground'
          : 'bg-card/50 font-medium text-muted-foreground hover:bg-card/80 hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function stageCapabilities(
  stage: ValueStreamStage | undefined,
  capabilitiesById: Map<string, ValueStreamCapability>,
): ValueStreamCapability[] {
  if (!stage) return [];
  return stage.capabilityIds.flatMap((id) => {
    const cap = capabilitiesById.get(id);
    return cap ? [cap] : [];
  });
}

export function ValueStreamDiagram({
  stream,
  capabilities,
}: {
  stream: ValueStream;
  capabilities: ValueStreamCapability[];
}) {
  const baseId = useId();
  const capabilitiesById = useMemo(
    () => new Map(capabilities.map((cap) => [cap.id, cap])),
    [capabilities],
  );

  const [selectedId, setSelectedId] = useState(stream.stages[0]?.id ?? '');
  const selectedIndex = Math.max(
    stream.stages.findIndex((s) => s.id === selectedId),
    0,
  );
  const selectedStage = stream.stages[selectedIndex];
  const selectedCapabilities = useMemo(
    () => stageCapabilities(selectedStage, capabilitiesById),
    [selectedStage, capabilitiesById],
  );

  if (!selectedStage) {
    return (
      <TitledCard title="Stages" subtitle="The steps that deliver value, from trigger to outcome">
        <EmptyState label="No stages yet" hint="add them with Edit" />
      </TitledCard>
    );
  }

  const tabId = (stage: ValueStreamStage) => `${baseId}-tab-${stage.id}`;
  const panelId = `${baseId}-panel`;

  // Arrow keys move the selection; Home/End jump. Focus follows the
  // selection (onFocus selects), the usual "automatic activation" tabs.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = stream.stages.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(selectedIndex + 1, last)
        : event.key === 'ArrowLeft'
          ? Math.max(selectedIndex - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const stage = stream.stages[next];
    if (!stage) return;
    setSelectedId(stage.id);
    document.getElementById(tabId(stage))?.focus();
  };

  // Centre of the selected chevron as a share of the row width: every
  // chevron is flex-1, so no DOM measurement is needed.
  const caretPosition = `${((selectedIndex + 0.5) / stream.stages.length) * 100}%`;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Stages"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex w-full overflow-hidden rounded-lg border border-border bg-muted p-1"
      >
        {stream.stages.map((stage, i) => (
          <Chevron
            key={stage.id}
            id={tabId(stage)}
            panelId={panelId}
            label={stage.name}
            isFirst={i === 0}
            isLast={i === stream.stages.length - 1}
            isSelected={stage.id === selectedStage.id}
            onSelect={() => setSelectedId(stage.id)}
          />
        ))}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId(selectedStage)} className="relative">
        <div
          aria-hidden
          className="absolute -top-1.5 z-10 size-3 -translate-x-1/2 rotate-45 border-t border-l border-border bg-card"
          style={{ left: caretPosition }}
        />
        <TitledCard
          title={selectedStage.name}
          subtitle={`Stage ${selectedIndex + 1} of ${stream.stages.length} · capabilities backing it`}
        >
          {selectedCapabilities.length > 0 ? (
            selectedCapabilities.map((cap) => (
              <Link
                key={cap.id}
                to="/capabilities/$capabilityId"
                params={{ capabilityId: cap.id }}
                className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-foreground transition-colors hover:border-foreground/30"
              >
                <span className="font-medium">{cap.name}</span>
                {cap.description && (
                  <span className="line-clamp-2 text-muted-foreground">{cap.description}</span>
                )}
              </Link>
            ))
          ) : (
            <EmptyState
              label="No capabilities linked to this stage yet"
              hint="add them with Edit"
            />
          )}
        </TitledCard>
      </div>
    </div>
  );
}
