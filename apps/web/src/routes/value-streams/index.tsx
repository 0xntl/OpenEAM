import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Pencil, Route as RouteIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyCard } from '@/components/ui/empty-card';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/skeletons';
import { chevronClipPath, stageColumns } from '@/components/value-stream/chevron';
import {
  ValueStreamFormSheet,
  type ValueStreamFormValue,
} from '@/components/value-stream/value-stream-form-sheet';
import { useEnterprise, WriteOnly } from '@/lib/enterprise';

const VALUE_STREAMS_QUERY = gql`
  query ValueStreamsIndex($enterpriseId: String!) {
    valueStreams(enterpriseId: $enterpriseId) {
      id
      name
      description
      stages {
        id
        name
        capabilityIds
      }
    }
    businessCapabilities(enterpriseId: $enterpriseId) {
      id
      name
    }
  }
`;

interface ValueStreamSummary extends ValueStreamFormValue {
  stages: Array<{ id: string; name: string; capabilityIds: string[] }>;
}

interface ValueStreamsData {
  valueStreams: ValueStreamSummary[];
  businessCapabilities: { id: string; name: string }[];
}

// One stream per row, drawn as itself: its stages as a chevron strip, so the
// list is already a picture of how the enterprise delivers value rather than
// a set of cards that each have to be opened. "Shared" counts the stream's
// capabilities that another stream needs too.
function ValueStreamRow({
  vs,
  sharedCount,
  onEdit,
}: {
  vs: ValueStreamSummary;
  sharedCount: number;
  onEdit: () => void;
}) {
  const capabilityCount = new Set(vs.stages.flatMap((s) => s.capabilityIds)).size;
  return (
    <li className="group relative border-t border-border first:border-t-0">
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <WriteOnly>
          <Button variant="ghost" size="icon-sm" onClick={onEdit}>
            <Pencil strokeWidth={2} />
            <span className="sr-only">Edit</span>
          </Button>
        </WriteOnly>
      </div>
      <Link
        to="/value-streams/$valueStreamId"
        params={{ valueStreamId: vs.id }}
        className="grid gap-x-5 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/50 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] md:items-center"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-semibold text-foreground">{vs.name}</h2>
          {vs.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{vs.description}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {vs.stages.length} {vs.stages.length === 1 ? 'stage' : 'stages'} · {capabilityCount}{' '}
            {capabilityCount === 1 ? 'capability' : 'capabilities'}
            {sharedCount > 0 && ` · ${sharedCount} shared with other streams`}
          </p>
        </div>
        {vs.stages.length > 0 ? (
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: stageColumns(vs.stages.length) }}
          >
            {vs.stages.map((stage, i) => (
              <span
                key={stage.id}
                style={{ clipPath: chevronClipPath(i, vs.stages.length, 9) }}
                className="truncate bg-muted px-4 py-1.5 text-center text-[11px] font-medium text-foreground"
              >
                {stage.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No stages yet</p>
        )}
      </Link>
    </li>
  );
}

function ValueStreamsIndexRoute() {
  const { enterprise } = useEnterprise();
  const { data, loading, error, refetch } = useQuery<ValueStreamsData>(VALUE_STREAMS_QUERY, {
    variables: { enterpriseId: enterprise?.id },
    skip: !enterprise,
  });
  const [editingStream, setEditingStream] = useState<ValueStreamSummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openCreate = () => {
    setEditingStream(null);
    setSheetOpen(true);
  };

  const openEdit = (vs: ValueStreamSummary) => {
    setEditingStream(vs);
    setSheetOpen(true);
  };

  const streams = data?.valueStreams ?? [];
  // How many streams need each capability, to count what a stream shares.
  const streamsPerCapability = new Map<string, number>();
  for (const vs of streams) {
    for (const id of new Set(vs.stages.flatMap((s) => s.capabilityIds))) {
      streamsPerCapability.set(id, (streamsPerCapability.get(id) ?? 0) + 1);
    }
  }
  const sharedCountOf = (vs: ValueStreamSummary) =>
    [...new Set(vs.stages.flatMap((s) => s.capabilityIds))].filter(
      (id) => (streamsPerCapability.get(id) ?? 0) > 1,
    ).length;

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title="Value Streams"
        action={
          <WriteOnly>
            <Button onClick={openCreate} disabled={!enterprise}>
              New value stream
            </Button>
          </WriteOnly>
        }
      />

      {loading && !data && <ListSkeleton />}
      {error && <p className="text-sm text-destructive">Failed to load value streams.</p>}

      {streams.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {streams.map((vs) => (
            <ValueStreamRow
              key={vs.id}
              vs={vs}
              sharedCount={sharedCountOf(vs)}
              onEdit={() => openEdit(vs)}
            />
          ))}
        </ul>
      )}
      <div className="grid gap-4">
        {data?.valueStreams.length === 0 && (
          <EmptyCard
            className="col-span-full"
            icon={RouteIcon}
            title="No value streams yet"
            description="The end-to-end stages that deliver value to a customer, each stage backed by capabilities."
            action={
              <WriteOnly>
                <Button onClick={openCreate} disabled={!enterprise}>
                  New value stream
                </Button>
              </WriteOnly>
            }
          />
        )}
      </div>

      {enterprise && (
        <ValueStreamFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          enterpriseId={enterprise.id}
          capabilities={data?.businessCapabilities ?? []}
          valueStream={editingStream}
          onSaved={refetch}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/value-streams/')({
  component: ValueStreamsIndexRoute,
});
