import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ActorFormSheet, DELETE_ACTOR } from '@/components/actors/actor-form-sheet';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  contentWidthClassName,
  detailDescriptionClassName,
  detailFactsClassName,
  Fact,
  PageHeader,
  pageBackLinkClassName,
  TitledCard,
} from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DetailSkeleton } from '@/components/ui/skeletons';
import {
  ACTOR_INVOLVEMENT_LABEL,
  ACTOR_INVOLVEMENT_STYLE,
  ACTOR_INVOLVEMENTS,
  ACTOR_KIND_LABEL,
  ACTOR_KIND_STYLE,
} from '@/lib/actor';
import { useConfirm } from '@/lib/confirm';
import { useEnterprise, WriteOnly } from '@/lib/enterprise';
import type { ActorCapabilityLink, ActorDetail, ActorInvolvement } from '@/lib/entities';
import { formatValidity } from '@/lib/labels';
import { toast } from '@/lib/toast';

const ACTOR_QUERY = gql`
  query Actor($id: String!) {
    actor(id: $id) {
      id
      enterpriseId
      name
      description
      kind
      organizationUnitId
      organizationUnitName
      capabilities {
        linkId
        capabilityId
        capabilityName
        involvement
        validFrom
        validTo
      }
    }
  }
`;

const CAPABILITIES_QUERY = gql`
  query CapabilitiesForActor($enterpriseId: String!) {
    businessCapabilities(enterpriseId: $enterpriseId) {
      id
      name
    }
  }
`;

const LINK_CAPABILITY_ACTOR = gql`
  mutation LinkCapabilityActor($input: CapabilityActorInput!) {
    linkCapabilityActor(input: $input) {
      id
    }
  }
`;

const UNLINK_CAPABILITY_ACTOR = gql`
  mutation UnlinkCapabilityActor($linkId: String!) {
    unlinkCapabilityActor(linkId: $linkId)
  }
`;

interface ActorData {
  actor: ActorDetail | null;
}
interface CapabilitiesData {
  businessCapabilities: Array<{ id: string; name: string }>;
}

function LinkRow({ link, onRemove }: { link: ActorCapabilityLink; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to="/capabilities/$capabilityId"
          params={{ capabilityId: link.capabilityId }}
          className="truncate text-xs text-foreground hover:underline"
        >
          {link.capabilityName}
        </Link>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${ACTOR_INVOLVEMENT_STYLE[link.involvement]}`}
        >
          {ACTOR_INVOLVEMENT_LABEL[link.involvement]}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatValidity(link.validFrom, link.validTo)}
        </span>
        <WriteOnly>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remove link to ${link.capabilityName}`}
          >
            <Trash2 />
          </Button>
        </WriteOnly>
      </div>
    </div>
  );
}

function ActorDetailRoute() {
  const { actorId } = Route.useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { enterprise } = useEnterprise();
  const { data, loading, error, refetch } = useQuery<ActorData>(ACTOR_QUERY, {
    variables: { id: actorId },
  });
  const { data: capData } = useQuery<CapabilitiesData>(CAPABILITIES_QUERY, {
    variables: { enterpriseId: enterprise?.id },
    skip: !enterprise,
  });

  const [linkCapabilityActor, { error: linkError }] = useMutation(LINK_CAPABILITY_ACTOR);
  const [unlinkCapabilityActor] = useMutation(UNLINK_CAPABILITY_ACTOR);
  // Evict the deleted row so the list this navigates back to does not serve
  // it from cache. Apollo drops dangling references from arrays on its own.
  const [deleteActor] = useMutation(DELETE_ACTOR, {
    update(cache, _result, { variables }) {
      cache.evict({ id: cache.identify({ __typename: 'Actor', id: variables?.id }) });
      cache.gc();
    },
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [capabilityId, setCapabilityId] = useState('');
  const [involvement, setInvolvement] = useState<ActorInvolvement>('PERFORMS');
  const [validFrom, setValidFrom] = useState('');

  const actor = data?.actor;

  if (loading) {
    return (
      <div className={contentWidthClassName}>
        <DetailSkeleton />
      </div>
    );
  }
  if (error) {
    return (
      <div className={contentWidthClassName}>
        <p className="text-sm text-destructive">Failed to load actor.</p>
      </div>
    );
  }
  if (!actor) throw notFound();

  // Closed links are history. Separating them is the whole point of carrying
  // validity intervals — showing them in one undifferentiated list would make
  // a past owner look like a current one.
  const current = actor.capabilities.filter((c) => c.validTo === null);
  const ended = actor.capabilities.filter((c) => c.validTo !== null);

  const handleLink = async () => {
    await linkCapabilityActor({
      variables: {
        input: {
          capabilityId,
          actorId: actor.id,
          involvement,
          validFrom: validFrom || null,
          validTo: null,
        },
      },
    });
    setCapabilityId('');
    setValidFrom('');
    await refetch();
  };

  const handleRemove = async (linkId: string) => {
    await unlinkCapabilityActor({ variables: { linkId } });
    await refetch();
  };

  const handleDelete = async () => {
    if (!(await confirm({ title: `Delete "${actor.name}"?`, destructive: true }))) return;
    await deleteActor({ variables: { id: actor.id } });
    toast.success(`"${actor.name}" deleted.`);
    navigate({ to: '/actors' });
  };

  const linkedIds = new Set(current.map((c) => c.capabilityId));
  const available = (capData?.businessCapabilities ?? []).filter((c) => !linkedIds.has(c.id));

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        back={
          <Link to="/actors" className={pageBackLinkClassName}>
            <ChevronLeft className="size-3.5" /> Actors
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {actor.name}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${ACTOR_KIND_STYLE[actor.kind]}`}
            >
              {ACTOR_KIND_LABEL[actor.kind]}
            </span>
          </span>
        }
        action={
          <>
            <WriteOnly>
              <Button variant="ghost" size="sm" onClick={() => setSheetOpen(true)}>
                Edit
              </Button>
            </WriteOnly>
            <WriteOnly>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Delete
              </Button>
            </WriteOnly>
          </>
        }
      />

      {actor.description && <p className={detailDescriptionClassName}>{actor.description}</p>}

      {actor.organizationUnitName && (
        <div className={detailFactsClassName}>
          <Fact label="Models unit" value={actor.organizationUnitName} />
        </div>
      )}

      <TitledCard
        title="Capabilities"
        subtitle="What this actor is involved in, and in what capacity"
      >
        {current.length > 0 ? (
          current.map((link) => (
            <LinkRow key={link.linkId} link={link} onRemove={() => handleRemove(link.linkId)} />
          ))
        ) : (
          <EmptyState label="Not linked to any capability yet" hint="add one below" />
        )}

        <WriteOnly>
          <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
            <label
              htmlFor="link-capability"
              className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground"
            >
              Capability
              <Select value={capabilityId} onValueChange={setCapabilityId}>
                <SelectTrigger id="link-capability" className="w-full">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label
              htmlFor="link-involvement"
              className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
            >
              Involvement
              <Select
                value={involvement}
                onValueChange={(v) => setInvolvement(v as ActorInvolvement)}
              >
                <SelectTrigger id="link-involvement" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTOR_INVOLVEMENTS.map((i) => (
                    <SelectItem key={i} value={i}>
                      {ACTOR_INVOLVEMENT_LABEL[i]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label
              htmlFor="link-valid-from"
              className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
            >
              From
              <Input
                id="link-valid-from"
                type="date"
                className="w-40"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </label>

            <Button onClick={handleLink} disabled={!capabilityId}>
              Add
            </Button>
          </div>
        </WriteOnly>

        {linkError && <p className="text-sm text-destructive">{linkError.message}</p>}

        {ended.length > 0 && (
          <details className="pt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Ended ({ended.length})
            </summary>
            <div className="flex flex-col gap-1.5 pt-2 opacity-60">
              {ended.map((link) => (
                <LinkRow key={link.linkId} link={link} onRemove={() => handleRemove(link.linkId)} />
              ))}
            </div>
          </details>
        )}
      </TitledCard>

      {enterprise && (
        <ActorFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          actor={actor}
          enterpriseId={actor.enterpriseId}
          onSaved={refetch}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/actors/$actorId')({
  component: ActorDetailRoute,
});
