import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Pencil, Users } from 'lucide-react';
import { useState } from 'react';
import { ActorFormSheet } from '@/components/actors/actor-form-sheet';
import { Button } from '@/components/ui/button';
import { EmptyCard } from '@/components/ui/empty-card';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { ListSkeleton } from '@/components/ui/skeletons';
import { ACTOR_KIND_LABEL, ACTOR_KIND_STYLE, ACTOR_KINDS } from '@/lib/actor';
import { useEnterprise, WriteOnly } from '@/lib/enterprise';
import type { ActorKind, ActorSummary } from '@/lib/entities';

const ACTORS_QUERY = gql`
  query Actors($enterpriseId: String!) {
    actors(enterpriseId: $enterpriseId) {
      id
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
        validTo
      }
    }
  }
`;

interface ActorsData {
  actors: ActorSummary[];
}

function ActorCard({ actor, onEdit }: { actor: ActorSummary; onEdit: () => void }) {
  // Only open links describe the present. A closed one is history, and
  // counting it here would overstate what this actor is answerable for today.
  const open = actor.capabilities.filter((c) => c.validTo === null);
  const accountable = open.filter((c) => c.involvement === 'ACCOUNTABLE').length;

  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/actors/$actorId"
          params={{ actorId: actor.id }}
          className="min-w-0 text-sm font-medium text-foreground hover:underline"
        >
          {actor.name}
        </Link>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${ACTOR_KIND_STYLE[actor.kind]}`}
        >
          {ACTOR_KIND_LABEL[actor.kind]}
        </span>
      </div>

      {actor.organizationUnitName && (
        <p className="text-xs text-muted-foreground">Unit: {actor.organizationUnitName}</p>
      )}
      {actor.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{actor.description}</p>
      )}

      <p className="mt-auto pt-1 text-xs text-muted-foreground">
        {open.length === 0
          ? 'No capabilities yet'
          : `${open.length} ${open.length === 1 ? 'capability' : 'capabilities'}`}
        {accountable > 0 && ` · accountable for ${accountable}`}
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

function ActorsIndexRoute() {
  const { enterprise } = useEnterprise();
  const { data, loading, error, refetch } = useQuery<ActorsData>(ACTORS_QUERY, {
    variables: { enterpriseId: enterprise?.id },
    skip: !enterprise,
  });
  const [editing, setEditing] = useState<ActorSummary | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (actor: ActorSummary) => {
    setCreating(false);
    setEditing(actor);
    setSheetOpen(true);
  };

  const actors = data?.actors ?? [];

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title="Actors"
        action={
          <WriteOnly>
            <Button onClick={openCreate} disabled={!enterprise}>
              New actor
            </Button>
          </WriteOnly>
        }
      />

      {!enterprise && !loading && (
        <p className="text-sm text-muted-foreground">Create an enterprise to get started.</p>
      )}
      {loading && !data && <ListSkeleton />}
      {error && <p className="text-sm text-destructive">Failed to load actors.</p>}

      {/* Grouped by kind rather than listed flat: the kinds answer different
          questions, and seeing how few actors are individuals is itself the
          point the model is making. */}
      {ACTOR_KINDS.map((kind) => {
        const group = actors.filter((a) => a.kind === kind);
        if (group.length === 0) return null;
        return (
          <section key={kind} className="flex flex-col gap-3 pt-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {ACTOR_KIND_LABEL[kind as ActorKind]}
              <span className="ml-2 font-normal opacity-60">{group.length}</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((actor) => (
                <ActorCard key={actor.id} actor={actor} onEdit={() => openEdit(actor)} />
              ))}
            </div>
          </section>
        );
      })}

      {!loading && actors.length === 0 && enterprise && (
        <EmptyCard
          className="col-span-full"
          icon={Users}
          title="No actors yet"
          description="Whoever answers for a capability or does its work — usually a role or a team, sometimes a person or an external party."
          action={
            <WriteOnly>
              <Button onClick={openCreate} disabled={!enterprise}>
                New actor
              </Button>
            </WriteOnly>
          }
        />
      )}

      {enterprise && (
        <ActorFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          actor={creating ? null : editing}
          enterpriseId={enterprise.id}
          onSaved={refetch}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/actors/')({
  component: ActorsIndexRoute,
});
