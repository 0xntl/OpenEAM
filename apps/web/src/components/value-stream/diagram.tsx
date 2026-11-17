// A value stream as its stages, with the capabilities behind every stage
// shown at once underneath: the capability-to-value-stream mapping that
// TOGAF's value stream guide (G178) calls the main benefit of having
// value streams at all. A capability needed by neighbouring stages becomes
// one tile spanning them, so what is shared reads at a glance.
//
// The layout is computed from the model and never drawn by hand: stages
// share one grid, tiles sit in its columns, and colour appears only
// through a lens chosen above the diagram, always with a legend. That is
// the point of the page — the designed look of a consultant's slide
// without anyone placing boxes.
//
// Selecting a stage or a capability fills the card below the diagram;
// hovering a capability marks every tile of it, since a capability needed
// by stages that are not neighbours appears more than once.
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { TitledCard } from '@/components/ui/page-header';
import {
  CAPABILITY_DIRECTION_FILL,
  CAPABILITY_DIRECTION_LABEL,
  CAPABILITY_DIRECTION_STYLE,
} from '@/lib/capability-direction';
import type { CapabilityDirection, ValueStream, ValueStreamCapability } from '@/lib/entities';
import { cn } from '@/lib/utils';
import { chevronClipPath, stageColumns } from './chevron';

type Lens = 'plain' | 'direction' | 'shared';
type Selection = { kind: 'stage'; id: string } | { kind: 'capability'; id: string } | null;
type Usage = Map<string, Array<{ stream: ValueStream; stages: string[] }>>;

const LENSES: Array<{ id: Lens; label: string }> = [
  { id: 'plain', label: 'Plain' },
  { id: 'direction', label: 'Direction' },
  { id: 'shared', label: 'Shared' },
];

const UNSET_FILL = 'border-dashed border-border bg-card';

// How many value streams use a capability, as fill. Neutral on purpose:
// more streams is more weight, not better or worse.
const SHARED_FILL = [
  UNSET_FILL,
  'border-border bg-card',
  'border-border bg-muted',
  'border-foreground/25 bg-foreground/10',
];
const SHARED_LABEL = ['No stream', '1 stream', '2 streams', '3 or more'];

export interface Tile {
  capabilityId: string;
  // First stage (0-based) and how many neighbouring stages the tile spans.
  start: number;
  span: number;
  lane: number;
}

// Each capability's runs of neighbouring stages, packed into lanes. A
// capability keeps one lane wherever all of its runs fit, so its tiles line
// up; capabilities come in the order the stream first needs them.
export function layoutTiles(stages: ValueStream['stages']): Tile[] {
  const order: string[] = [];
  for (const stage of stages) {
    for (const id of stage.capabilityIds) if (!order.includes(id)) order.push(id);
  }
  const taken: Array<Set<number>> = [];
  const tiles: Tile[] = [];
  for (const id of order) {
    const runs: Array<[number, number]> = [];
    stages.forEach((stage, i) => {
      if (!stage.capabilityIds.includes(id)) return;
      const last = runs[runs.length - 1];
      if (last && last[1] === i - 1) last[1] = i;
      else runs.push([i, i]);
    });
    const fits = (lane: number) =>
      runs.every(([a, b]) => {
        for (let k = a; k <= b; k++) if (taken[lane]?.has(k)) return false;
        return true;
      });
    let lane = 0;
    while (!fits(lane)) lane++;
    const row = taken[lane] ?? new Set<number>();
    taken[lane] = row;
    for (const [a, b] of runs) {
      for (let k = a; k <= b; k++) row.add(k);
      tiles.push({ capabilityId: id, start: a, span: b - a + 1, lane });
    }
  }
  return tiles;
}

export function ValueStreamDiagram({
  stream,
  capabilities,
  streams,
}: {
  stream: ValueStream;
  capabilities: ValueStreamCapability[];
  // Every value stream of the enterprise, for "used by other streams".
  streams: ValueStream[];
}) {
  const [lens, setLens] = useState<Lens>('plain');
  const [selection, setSelection] = useState<Selection>(
    stream.stages[0] ? { kind: 'stage', id: stream.stages[0].id } : null,
  );
  const [hovered, setHovered] = useState<string | null>(null);

  const capabilitiesById = useMemo(
    () => new Map(capabilities.map((cap) => [cap.id, cap])),
    [capabilities],
  );
  const tiles = useMemo(() => layoutTiles(stream.stages), [stream.stages]);
  // The streams each capability is needed in, with the stages by name.
  const usage = useMemo(() => {
    const byCapability: Usage = new Map();
    for (const s of streams) {
      for (const stage of s.stages) {
        for (const id of stage.capabilityIds) {
          const list = byCapability.get(id) ?? [];
          const entry = list.find((u) => u.stream.id === s.id);
          if (entry) entry.stages.push(stage.name);
          else list.push({ stream: s, stages: [stage.name] });
          byCapability.set(id, list);
        }
      }
    }
    return byCapability;
  }, [streams]);

  if (stream.stages.length === 0) {
    return (
      <TitledCard title="Stages" subtitle="The steps that deliver value, from trigger to outcome">
        <EmptyState label="No stages yet" hint="add them with Edit" />
      </TitledCard>
    );
  }

  const count = stream.stages.length;
  const columns = stageColumns(count);
  const streamCount = (id: string) => usage.get(id)?.length ?? 0;
  const fillOf = (id: string) => {
    if (lens === 'direction') {
      const direction = capabilitiesById.get(id)?.direction;
      return direction ? CAPABILITY_DIRECTION_FILL[direction] : UNSET_FILL;
    }
    if (lens === 'shared') return SHARED_FILL[Math.min(streamCount(id), 3)];
    return 'border-border bg-card';
  };
  const legend =
    lens === 'direction'
      ? [
          ...(Object.keys(CAPABILITY_DIRECTION_LABEL) as CapabilityDirection[]).map((key) => ({
            label: CAPABILITY_DIRECTION_LABEL[key],
            className: CAPABILITY_DIRECTION_FILL[key],
          })),
          { label: 'Not set', className: UNSET_FILL },
        ]
      : lens === 'shared'
        ? SHARED_LABEL.slice(1).map((label, i) => ({ label, className: SHARED_FILL[i + 1] }))
        : [];

  const selectedStageIndex =
    selection?.kind === 'stage' ? stream.stages.findIndex((s) => s.id === selection.id) : -1;
  // A stage without a capability gets an honest gap in the first lane,
  // which no tile can be using in that column.
  const emptyStages = stream.stages
    .map((stage, i) => (stage.capabilityIds.length === 0 ? i : -1))
    .filter((i) => i >= 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          <legend className="sr-only">Colour capabilities by</legend>
          {LENSES.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={lens === l.id}
              onClick={() => setLens(l.id)}
              className={cn(
                'h-6 rounded-md px-2.5 text-xs font-medium transition-colors',
                lens === l.id
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {l.label}
            </button>
          ))}
        </fieldset>
        {legend.length > 0 && (
          <ul className="ml-auto flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {legend.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <span aria-hidden className={cn('size-3 rounded-[3px] border', item.className)} />
                {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1.5" style={{ minWidth: count * 112 }}>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: columns }}>
            {stream.stages.map((stage, i) => {
              const selected = selectedStageIndex === i;
              return (
                <button
                  key={stage.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelection({ kind: 'stage', id: stage.id })}
                  style={{ clipPath: chevronClipPath(i, count, 12) }}
                  className={cn(
                    'flex min-h-10 flex-col items-center justify-center px-5 py-1.5 text-center leading-tight transition-colors',
                    selected
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-foreground hover:bg-foreground/10',
                  )}
                >
                  <span className="text-xs font-semibold">{stage.name}</span>
                  <span className="text-[10px] opacity-70">
                    {stage.capabilityIds.length}{' '}
                    {stage.capabilityIds.length === 1 ? 'capability' : 'capabilities'}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: columns, gridAutoRows: 'minmax(3.25rem, auto)' }}
          >
            {tiles.map((tile) => {
              const cap = capabilitiesById.get(tile.capabilityId);
              const selected =
                selection?.kind === 'capability' && selection.id === tile.capabilityId;
              const related =
                hovered === tile.capabilityId ||
                (selectedStageIndex >= tile.start && selectedStageIndex < tile.start + tile.span);
              const others = streamCount(tile.capabilityId) - 1;
              return (
                <button
                  key={`${tile.capabilityId}-${tile.start}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelection({ kind: 'capability', id: tile.capabilityId })}
                  onMouseEnter={() => setHovered(tile.capabilityId)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(tile.capabilityId)}
                  onBlur={() => setHovered(null)}
                  style={{
                    gridColumn: `${tile.start + 1} / span ${tile.span}`,
                    gridRow: tile.lane + 1,
                  }}
                  className={cn(
                    'flex min-w-0 flex-col justify-between gap-1 rounded-lg border px-2.5 py-2 text-left transition-shadow',
                    fillOf(tile.capabilityId),
                    selected
                      ? 'ring-2 ring-foreground'
                      : related
                        ? 'ring-2 ring-foreground/30'
                        : '',
                  )}
                >
                  <span className="text-xs font-semibold leading-tight text-foreground">
                    {cap?.name ?? 'Unknown capability'}
                  </span>
                  <span className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{tile.span > 1 ? `${tile.span} stages` : ''}</span>
                    <span>
                      {others > 0 ? `+${others} other stream${others === 1 ? '' : 's'}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
            {emptyStages.map((i) => (
              <div
                key={`empty-${stream.stages[i]?.id}`}
                style={{ gridColumn: i + 1, gridRow: 1 }}
                className="flex items-center justify-center rounded-lg border border-dashed border-border px-2 text-center text-[10px] text-muted-foreground"
              >
                No capability yet
              </div>
            ))}
          </div>
        </div>
      </div>

      <SelectionCard
        stream={stream}
        selection={selection}
        capabilitiesById={capabilitiesById}
        usage={usage}
        onSelect={setSelection}
      />
    </div>
  );
}

const rowClassName =
  'flex flex-col gap-0.5 rounded-md border border-border bg-muted/50 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-foreground/30';

function SelectionCard({
  stream,
  selection,
  capabilitiesById,
  usage,
  onSelect,
}: {
  stream: ValueStream;
  selection: Selection;
  capabilitiesById: Map<string, ValueStreamCapability>;
  usage: Usage;
  onSelect: (selection: Selection) => void;
}) {
  if (selection?.kind === 'stage') {
    const index = stream.stages.findIndex((s) => s.id === selection.id);
    const stage = stream.stages[index];
    if (!stage) return null;
    const caps = stage.capabilityIds.flatMap((id) => capabilitiesById.get(id) ?? []);
    return (
      <TitledCard
        title={stage.name}
        subtitle={`Stage ${index + 1} of ${stream.stages.length} · capabilities backing it`}
      >
        {caps.length > 0 ? (
          caps.map((cap) => (
            <button
              key={cap.id}
              type="button"
              onClick={() => onSelect({ kind: 'capability', id: cap.id })}
              className={rowClassName}
            >
              <span className="font-medium">{cap.name}</span>
              {cap.description && (
                <span className="line-clamp-2 text-muted-foreground">{cap.description}</span>
              )}
            </button>
          ))
        ) : (
          <EmptyState label="No capabilities linked to this stage yet" hint="add them with Edit" />
        )}
      </TitledCard>
    );
  }

  if (selection?.kind === 'capability') {
    const cap = capabilitiesById.get(selection.id);
    if (!cap) return null;
    const uses = usage.get(cap.id) ?? [];
    const here = uses.find((u) => u.stream.id === stream.id);
    const elsewhere = uses.filter((u) => u.stream.id !== stream.id);
    return (
      <TitledCard
        title={cap.name}
        subtitle={`Needed in ${here?.stages.join(', ') ?? 'no stage'} of this stream`}
        action={
          <Link
            to="/capabilities/$capabilityId"
            params={{ capabilityId: cap.id }}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            Open capability ›
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {cap.direction && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] ${CAPABILITY_DIRECTION_STYLE[cap.direction]}`}
            >
              {CAPABILITY_DIRECTION_LABEL[cap.direction]}
            </span>
          )}
          {cap.description && (
            <span className="text-xs text-muted-foreground">{cap.description}</span>
          )}
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">Other value streams</p>
        {elsewhere.length > 0 ? (
          elsewhere.map((u) => (
            <Link
              key={u.stream.id}
              to="/value-streams/$valueStreamId"
              params={{ valueStreamId: u.stream.id }}
              className={rowClassName}
            >
              <span className="font-medium">{u.stream.name}</span>
              <span className="text-muted-foreground">{u.stages.join(' · ')}</span>
            </Link>
          ))
        ) : (
          <EmptyState label="No other value stream needs it" />
        )}
      </TitledCard>
    );
  }

  return null;
}
