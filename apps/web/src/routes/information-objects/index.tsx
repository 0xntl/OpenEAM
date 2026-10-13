import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Library, Pencil } from 'lucide-react';
import { useState } from 'react';
import { InformationObjectFormSheet } from '@/components/information-objects/information-object-form-sheet';
import { Button } from '@/components/ui/button';
import { EmptyCard } from '@/components/ui/empty-card';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/skeletons';
import { useEnterprise, WriteOnly } from '@/lib/enterprise';
import type { InformationObjectSummary } from '@/lib/entities';

const INFORMATION_OBJECTS_QUERY = gql`
  query InformationObjects($enterpriseId: String!) {
    informationObjects(enterpriseId: $enterpriseId) {
      id
      name
      description
      capabilities {
        linkId
        capabilityId
        capabilityName
        usage
        validTo
      }
    }
  }
`;

interface InformationObjectsData {
  informationObjects: InformationObjectSummary[];
}

function InformationObjectCard({
  info,
  onEdit,
}: {
  info: InformationObjectSummary;
  onEdit: () => void;
}) {
  const open = info.capabilities.filter((c) => c.validTo === null);
  const owner = open.find((c) => c.usage === 'OWNS');

  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md">
      <Link
        to="/information-objects/$informationObjectId"
        params={{ informationObjectId: info.id }}
        className="min-w-0 pr-16 text-sm font-medium text-foreground hover:underline"
      >
        {info.name}
      </Link>

      {info.description && (
        <p className="line-clamp-3 text-xs text-muted-foreground">{info.description}</p>
      )}

      {/* Who owns a piece of information is the question this page exists to
          answer, so an unowned one says so rather than showing nothing. */}
      <p className="mt-auto pt-1 text-xs">
        {owner ? (
          <span className="text-muted-foreground">
            Owned by <span className="text-foreground">{owner.capabilityName}</span>
          </span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">No owner</span>
        )}
        <span className="text-muted-foreground">
          {' · '}
          {open.length} {open.length === 1 ? 'capability' : 'capabilities'}
        </span>
      </p>

      <WriteOnly>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil strokeWidth={2} />
          <span className="sr-only">Edit</span>
        </Button>
      </WriteOnly>
    </div>
  );
}

function InformationObjectsIndexRoute() {
  const { enterprise } = useEnterprise();
  const { data, loading, error, refetch } = useQuery<InformationObjectsData>(
    INFORMATION_OBJECTS_QUERY,
    { variables: { enterpriseId: enterprise?.id }, skip: !enterprise },
  );
  const [editing, setEditing] = useState<InformationObjectSummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (info: InformationObjectSummary) => {
    setCreating(false);
    setEditing(info);
    setSheetOpen(true);
  };

  const objects = data?.informationObjects ?? [];
  const unowned = objects.filter(
    (o) => !o.capabilities.some((c) => c.validTo === null && c.usage === 'OWNS'),
  ).length;

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title="Information"
        action={
          <WriteOnly>
            <Button onClick={openCreate} disabled={!enterprise}>
              New information object
            </Button>
          </WriteOnly>
        }
      />

      <p className="text-sm text-muted-foreground">
        What the enterprise knows about, in business language and independent of the systems holding
        it.{' '}
        {unowned > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            {unowned} {unowned === 1 ? 'has' : 'have'} no owner.
          </span>
        )}
      </p>

      {!enterprise && !loading && (
        <p className="text-sm text-muted-foreground">Create an enterprise to get started.</p>
      )}
      {loading && !data && <ListSkeleton />}
      {error && <p className="text-sm text-destructive">Failed to load information objects.</p>}

      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        {objects.map((info) => (
          <InformationObjectCard key={info.id} info={info} onEdit={() => openEdit(info)} />
        ))}
      </div>

      {!loading && objects.length === 0 && enterprise && (
        <EmptyCard
          className="col-span-full"
          icon={Library}
          title="No information objects yet"
          description="What the enterprise knows about, in business language. Start with the things people argue about owning — a claim, a customer record, an audit trail."
          action={
            <WriteOnly>
              <Button onClick={openCreate} disabled={!enterprise}>
                New information object
              </Button>
            </WriteOnly>
          }
        />
      )}

      {enterprise && (
        <InformationObjectFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          informationObject={creating ? null : editing}
          enterpriseId={enterprise.id}
          onSaved={refetch}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/information-objects/')({
  component: InformationObjectsIndexRoute,
});
