import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Pencil, Target } from 'lucide-react';
import { useState } from 'react';
import { CapabilityFormSheet } from '@/components/capabilities/capability-form-sheet';
import { Button } from '@/components/ui/button';
import { EmptyCard } from '@/components/ui/empty-card';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/skeletons';
import { CAPABILITY_DIRECTION_LABEL, CAPABILITY_DIRECTION_STYLE } from '@/lib/capability-direction';
import { useEnterprise, WriteOnly } from '@/lib/enterprise';
import type { BusinessCapabilitySummary } from '@/lib/entities';

const BUSINESS_CAPABILITIES_QUERY = gql`
  query BusinessCapabilities($enterpriseId: String!) {
    businessCapabilities(enterpriseId: $enterpriseId) {
      id
      name
      description
      direction
      businessProcesses {
        id
      }
      resources {
        id
      }
      valueStreamStages {
        valueStreamId
        valueStreamName
        stageId
        stageName
      }
    }
  }
`;

interface BusinessCapabilitiesData {
  businessCapabilities: BusinessCapabilitySummary[];
}

function CapabilityCard({ cap, onEdit }: { cap: BusinessCapabilitySummary; onEdit: () => void }) {
  const [firstStage, ...restStages] = cap.valueStreamStages;

  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/capabilities/$capabilityId"
            params={{ capabilityId: cap.id }}
            className="truncate font-medium text-foreground hover:text-foreground"
          >
            {cap.name}
          </Link>
          {cap.direction && (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${CAPABILITY_DIRECTION_STYLE[cap.direction]}`}
            >
              {CAPABILITY_DIRECTION_LABEL[cap.direction]}
            </span>
          )}
        </div>
        <WriteOnly>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Pencil strokeWidth={2} />
            <span className="sr-only">Edit</span>
          </Button>
        </WriteOnly>
      </div>

      {cap.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{cap.description}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {firstStage ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {firstStage.valueStreamName} <span className="opacity-60">›</span>{' '}
            {firstStage.stageName}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">No value stream yet</span>
        )}
        {restStages.length > 0 && (
          <span className="text-[10px] text-muted-foreground">+{restStages.length} more</span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>
          {cap.businessProcesses.length} process{cap.businessProcesses.length === 1 ? '' : 'es'}
        </span>
        <span>
          {cap.resources.length} resource{cap.resources.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

function CapabilitiesIndexRoute() {
  const { enterprise } = useEnterprise();
  const { data, loading, error, refetch } = useQuery<BusinessCapabilitiesData>(
    BUSINESS_CAPABILITIES_QUERY,
    { variables: { enterpriseId: enterprise?.id }, skip: !enterprise },
  );
  const [editingCap, setEditingCap] = useState<BusinessCapabilitySummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const openCreate = () => {
    setCreating(true);
    setEditingCap(null);
    setSheetOpen(true);
  };

  const openEdit = (cap: BusinessCapabilitySummary) => {
    setCreating(false);
    setEditingCap(cap);
    setSheetOpen(true);
  };

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title="Business Capabilities"
        action={
          <WriteOnly>
            <Button onClick={openCreate} disabled={!enterprise}>
              New capability
            </Button>
          </WriteOnly>
        }
      />

      {!enterprise && !loading && (
        <p className="text-sm text-muted-foreground">Create an enterprise to get started.</p>
      )}
      {loading && !data && <ListSkeleton />}
      {error && <p className="text-sm text-destructive">Failed to load capabilities.</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.businessCapabilities.map((cap) => (
          <CapabilityCard key={cap.id} cap={cap} onEdit={() => openEdit(cap)} />
        ))}
        {data?.businessCapabilities.length === 0 && (
          <EmptyCard
            className="col-span-full"
            icon={Target}
            title="No business capabilities yet"
            description="What the organization is able to do, stated so it stays true when the how changes. Start with the five to ten that matter most."
            action={
              <WriteOnly>
                <Button onClick={openCreate} disabled={!enterprise}>
                  New capability
                </Button>
              </WriteOnly>
            }
          />
        )}
      </div>

      {enterprise && (
        <CapabilityFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          capability={creating ? null : editingCap}
          enterpriseId={enterprise.id}
          onSaved={refetch}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/capabilities/')({
  component: CapabilitiesIndexRoute,
});
