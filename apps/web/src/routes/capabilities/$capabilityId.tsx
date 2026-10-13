import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import {
  CapabilityFormSheet,
  DELETE_BUSINESS_CAPABILITY,
} from '@/components/capabilities/capability-form-sheet';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  contentWidthClassName,
  detailCardGridClassName,
  detailDescriptionClassName,
  detailFactsClassName,
  PageHeader,
  pageBackLinkClassName,
  TitledCard,
} from '@/components/ui/page-header';
import { DetailSkeleton } from '@/components/ui/skeletons';
import { ACTOR_INVOLVEMENT_LABEL } from '@/lib/actor';
import { CAPABILITY_DIRECTION_LABEL, CAPABILITY_DIRECTION_STYLE } from '@/lib/capability-direction';
import { useConfirm } from '@/lib/confirm';
import { WriteOnly } from '@/lib/enterprise';
import type { BusinessCapabilityDetail, CapabilityResource } from '@/lib/entities';
import { INFORMATION_USAGE_LABEL } from '@/lib/information-usage';
import { BUILDING_BLOCK_KIND_LABEL, kindOf } from '@/lib/labels';
import { toast } from '@/lib/toast';

const BUSINESS_CAPABILITY_QUERY = gql`
  query BusinessCapability($id: String!) {
    businessCapability(id: $id) {
      id
      enterpriseId
      name
      description
      direction
      actors {
        id
        name
        kind
        involvement
      }
      resources {
        id
        name
        lifecyclePhase
        __typename
      }
      information {
        id
        name
        usage
      }
      businessProcesses {
        id
        name
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

interface BusinessCapabilityData {
  businessCapability: BusinessCapabilityDetail | null;
}

function Item({ label, tag }: { label: string; tag?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">
      <span className="min-w-0 truncate">{label}</span>
      {tag ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {tag}
        </span>
      ) : null}
    </div>
  );
}

function ProcessLink({ id, label }: { id: string; label: string }) {
  return (
    <Link
      to="/business-processes/$processId"
      params={{ processId: id }}
      className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-foreground font-medium hover:border-foreground/30 transition-colors"
    >
      {label}
    </Link>
  );
}

function ResourceItem({ resource }: { resource: CapabilityResource }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">
      <span>{resource.name}</span>
      <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {BUILDING_BLOCK_KIND_LABEL[kindOf(resource.__typename)]}
      </span>
    </div>
  );
}

function CapabilityDetail({
  cap,
  onEdit,
  onDelete,
}: {
  cap: BusinessCapabilityDetail;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {cap.name}
            {cap.direction && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] ${CAPABILITY_DIRECTION_STYLE[cap.direction]}`}
              >
                {CAPABILITY_DIRECTION_LABEL[cap.direction]}
              </span>
            )}
          </span>
        }
        back={
          <Link to="/capabilities" className={pageBackLinkClassName}>
            <ChevronLeft className="size-3.5" />
            Business Capabilities
          </Link>
        }
        action={
          <>
            <WriteOnly>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
            </WriteOnly>
            <WriteOnly>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Delete
              </Button>
            </WriteOnly>
          </>
        }
      />

      {cap.description && <p className={detailDescriptionClassName}>{cap.description}</p>}

      <div className={detailFactsClassName}>
        {cap.valueStreamStages.length > 0 ? (
          cap.valueStreamStages.map((link) => (
            <Link
              key={`${link.valueStreamId}-${link.stageId}`}
              to="/value-streams/$valueStreamId"
              params={{ valueStreamId: link.valueStreamId }}
              className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              {link.valueStreamName} <span className="opacity-60">›</span> {link.stageName}
            </Link>
          ))
        ) : (
          <EmptyState label="Not part of any value stream yet" />
        )}
      </div>

      <div className={detailCardGridClassName}>
        <TitledCard
          title="People"
          subtitle="Actors, stakeholders, business units or partners involved in delivering this capability"
        >
          {cap.actors.length > 0 ? (
            cap.actors.map((a) => (
              <Item key={a.id} label={a.name} tag={ACTOR_INVOLVEMENT_LABEL[a.involvement]} />
            ))
          ) : (
            <EmptyState label="No people defined yet" />
          )}
        </TitledCard>

        <TitledCard
          title="Resources"
          subtitle="Architecture and solution building blocks that realize this capability"
        >
          {cap.resources.length > 0 ? (
            cap.resources.map((r) => <ResourceItem key={r.id} resource={r} />)
          ) : (
            <EmptyState label="No building blocks linked yet" />
          )}
        </TitledCard>

        <TitledCard
          title="Information"
          subtitle="Business data, knowledge, and insight required or consumed"
        >
          {cap.information.length > 0 ? (
            cap.information.map((i) => (
              <Item key={i.id} label={i.name} tag={INFORMATION_USAGE_LABEL[i.usage]} />
            ))
          ) : (
            <EmptyState label="No information defined yet" />
          )}
        </TitledCard>

        <TitledCard
          title="Business Processes"
          subtitle="Business processes through which this capability is delivered"
        >
          {cap.businessProcesses.length > 0 ? (
            cap.businessProcesses.map((p) => <ProcessLink key={p.id} id={p.id} label={p.name} />)
          ) : (
            <EmptyState label="No processes defined yet" />
          )}
        </TitledCard>
      </div>
    </div>
  );
}

function CapabilityRoute() {
  const { capabilityId } = Route.useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data, loading, error, refetch } = useQuery<BusinessCapabilityData>(
    BUSINESS_CAPABILITY_QUERY,
    { variables: { id: capabilityId } },
  );
  const [deleteBusinessCapability] = useMutation(DELETE_BUSINESS_CAPABILITY, {
    update(cache, _result, { variables }) {
      if (!variables?.id) return;
      cache.evict({ id: cache.identify({ __typename: 'BusinessCapability', id: variables.id }) });
      cache.gc();
    },
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: `Delete "${data?.businessCapability?.name ?? 'this capability'}"?`,
        destructive: true,
      }))
    )
      return;
    await deleteBusinessCapability({ variables: { id: capabilityId } });
    toast.success('Deleted.');
    navigate({ to: '/capabilities' });
  };

  if (loading)
    return (
      <div className={contentWidthClassName}>
        <DetailSkeleton />
      </div>
    );
  if (error)
    return (
      <div className={contentWidthClassName}>
        <p className="text-sm text-destructive">Failed to load capability.</p>
      </div>
    );
  if (!data?.businessCapability) throw notFound();

  return (
    <>
      <CapabilityDetail
        cap={data.businessCapability}
        onEdit={() => setSheetOpen(true)}
        onDelete={handleDelete}
      />
      <CapabilityFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        capability={data.businessCapability}
        enterpriseId={data.businessCapability.enterpriseId}
        onSaved={refetch}
      />
    </>
  );
}

export const Route = createFileRoute('/capabilities/$capabilityId')({
  component: CapabilityRoute,
});
