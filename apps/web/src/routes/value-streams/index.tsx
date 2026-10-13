import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Pencil, Route as RouteIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyCard } from '@/components/ui/empty-card';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/skeletons';
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

function ValueStreamCard({ vs, onEdit }: { vs: ValueStreamSummary; onEdit: () => void }) {
  return (
    <div className="group relative">
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
        className="flex flex-col gap-1.5 overflow-hidden rounded-xl border border-border bg-card px-4 py-4 shadow-xs transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-foreground/30 group-hover:shadow-md"
      >
        <h2 className="text-base font-semibold text-foreground">{vs.name}</h2>
        {vs.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{vs.description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {vs.stages.length} {vs.stages.length === 1 ? 'stage' : 'stages'} ·{' '}
          {new Set(vs.stages.flatMap((s) => s.capabilityIds)).size} capabilities
        </p>
      </Link>
    </div>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.valueStreams.map((vs) => (
          <ValueStreamCard key={vs.id} vs={vs} onEdit={() => openEdit(vs)} />
        ))}
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
