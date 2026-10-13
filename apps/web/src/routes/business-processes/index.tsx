import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Pencil, Workflow } from 'lucide-react';
import { useState } from 'react';
import { ProcessFormSheet } from '@/components/business-processes/process-form-sheet';
import { Button } from '@/components/ui/button';
import { EmptyCard } from '@/components/ui/empty-card';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/skeletons';
import { useEnterprise, WriteOnly } from '@/lib/enterprise';
import type { NamedRef } from '@/lib/entities';

const BUSINESS_PROCESSES_QUERY = gql`
  query BusinessProcessesIndex($enterpriseId: String!) {
    businessProcesses(enterpriseId: $enterpriseId) {
      id
      name
      description
      capabilityId
      triggerEvent
      outcome
      bpmnXml
    }
    businessCapabilities(enterpriseId: $enterpriseId) {
      id
      name
    }
  }
`;

interface BusinessProcessRef extends NamedRef {
  description?: string | null;
  capabilityId: string;
  triggerEvent?: string | null;
  outcome?: string | null;
  bpmnXml?: string | null;
}

interface BusinessProcessesData {
  businessProcesses: BusinessProcessRef[];
  businessCapabilities: NamedRef[];
}

function ProcessCard({ process, onEdit }: { process: BusinessProcessRef; onEdit: () => void }) {
  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/business-processes/$processId"
          params={{ processId: process.id }}
          className="font-medium text-foreground hover:text-foreground"
        >
          {process.name}
        </Link>
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
      {!process.bpmnXml && (
        <span className="w-fit rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground italic">
          No diagram yet
        </span>
      )}
    </div>
  );
}

function BusinessProcessesIndexRoute() {
  const { enterprise } = useEnterprise();
  const { data, loading, error, refetch } = useQuery<BusinessProcessesData>(
    BUSINESS_PROCESSES_QUERY,
    { variables: { enterpriseId: enterprise?.id }, skip: !enterprise },
  );
  const [editingProcess, setEditingProcess] = useState<BusinessProcessRef | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const capabilities = data?.businessCapabilities ?? [];
  const capabilitiesById = new Map(capabilities.map((c) => [c.id, c]));
  const grouped = (data?.businessProcesses ?? []).reduce<Record<string, BusinessProcessRef[]>>(
    (acc, process) => {
      const key = process.capabilityId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(process);
      return acc;
    },
    {},
  );
  const groupedEntries = Object.entries(grouped).sort(([a], [b]) =>
    (capabilitiesById.get(a)?.name ?? a).localeCompare(capabilitiesById.get(b)?.name ?? b),
  );

  const openCreate = () => {
    setCreating(true);
    setEditingProcess(null);
    setSheetOpen(true);
  };

  const openEdit = (process: BusinessProcessRef) => {
    setCreating(false);
    setEditingProcess(process);
    setSheetOpen(true);
  };

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title="Business Processes"
        action={
          <WriteOnly>
            <Button
              onClick={openCreate}
              disabled={capabilities.length === 0}
              title={capabilities.length === 0 ? 'Create a business capability first' : undefined}
            >
              New process
            </Button>
          </WriteOnly>
        }
      />

      {loading && !data && <ListSkeleton />}
      {error && <p className="text-sm text-destructive">Failed to load business processes.</p>}

      <div className="flex flex-col gap-6">
        {groupedEntries.map(([capabilityId, processes]) => {
          const cap = capabilitiesById.get(capabilityId);
          return (
            <div key={capabilityId}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {cap?.name ?? capabilityId}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {processes.map((process) => (
                  <ProcessCard
                    key={process.id}
                    process={process}
                    onEdit={() => openEdit(process)}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {data?.businessProcesses.length === 0 && (
          <EmptyCard
            className="col-span-full"
            icon={Workflow}
            title="No business processes yet"
            description="How a capability is delivered, as an ordered flow with a trigger and an outcome. Each process belongs to one capability."
            action={
              <WriteOnly>
                <Button onClick={openCreate} disabled={capabilities.length === 0}>
                  New process
                </Button>
              </WriteOnly>
            }
          />
        )}
      </div>

      <ProcessFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        process={creating ? null : editingProcess}
        capabilities={capabilities}
        onSaved={refetch}
      />
    </div>
  );
}

export const Route = createFileRoute('/business-processes/')({
  component: BusinessProcessesIndexRoute,
});
