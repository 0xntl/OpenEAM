import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BuildingBlockFormSheet } from '@/components/building-blocks/building-block-form-sheet';
import { ModelIcon } from '@/components/icons/model-icon';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  contentWidthClassName,
  detailCardGridClassName,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DetailSkeleton } from '@/components/ui/skeletons';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/lib/confirm';
import { useEnterprise, WriteOnly } from '@/lib/enterprise';
import type {
  ArchitectureDomain,
  ArchitectureLevel,
  BuildingBlockRelationship,
  BuildingBlockRelationshipType,
  LifecyclePhase,
  OrganizationUnit,
} from '@/lib/entities';
import {
  ARCHITECTURE_LEVEL_LABEL,
  BUILDING_BLOCK_KIND_LABEL,
  formatValidity,
  kindOf,
  LIFECYCLE_LABEL,
  RELATIONSHIP_TYPE_LABEL,
  RELATIONSHIP_TYPES,
} from '@/lib/labels';
import { toast } from '@/lib/toast';
import { SELECT_EMPTY_VALUE } from '@/lib/utils';

const BUILDING_BLOCK_DETAIL_QUERY = gql`
  query BuildingBlockDetail($id: String!, $enterpriseId: String!) {
    buildingBlock(id: $id) {
      id
      name
      description
      icon
      lifecyclePhase
      validFrom
      validTo
      architectureDomainIds
      organizationUnitLinks {
        organizationUnitId
      }
      outgoingRelationships {
        id
        targetBuildingBlockId
        type
        description
        validFrom
        validTo
      }
      incomingRelationships {
        id
        sourceBuildingBlockId
        type
        description
        validFrom
        validTo
      }
      __typename
      ... on ArchitectureBuildingBlock {
        architectureLevel
      }
    }
    buildingBlocks(enterpriseId: $enterpriseId) {
      id
      name
      __typename
    }
    architectureDomains(enterpriseId: $enterpriseId) {
      id
      name
    }
    organizationUnits(enterpriseId: $enterpriseId) {
      id
      name
    }
  }
`;

const DELETE_BUILDING_BLOCK = gql`
  mutation DeleteBuildingBlock($id: String!) {
    deleteBuildingBlock(id: $id)
  }
`;

const CREATE_BUILDING_BLOCK_RELATIONSHIP = gql`
  mutation CreateBuildingBlockRelationship($input: BuildingBlockRelationshipInput!) {
    createBuildingBlockRelationship(input: $input) {
      id
    }
  }
`;

const DELETE_BUILDING_BLOCK_RELATIONSHIP = gql`
  mutation DeleteBuildingBlockRelationship($id: String!) {
    deleteBuildingBlockRelationship(id: $id)
  }
`;

interface BuildingBlockDetail {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  lifecyclePhase: LifecyclePhase;
  validFrom?: string | null;
  validTo?: string | null;
  architectureDomainIds: string[];
  organizationUnitLinks: { organizationUnitId: string }[];
  outgoingRelationships: BuildingBlockRelationship[];
  incomingRelationships: BuildingBlockRelationship[];
  __typename: 'ArchitectureBuildingBlock' | 'SolutionBuildingBlock';
  architectureLevel?: ArchitectureLevel | null;
}

interface BuildingBlockRef {
  id: string;
  name: string;
  __typename: 'ArchitectureBuildingBlock' | 'SolutionBuildingBlock';
}

interface BuildingBlockDetailData {
  buildingBlock: BuildingBlockDetail | null;
  buildingBlocks: BuildingBlockRef[];
  architectureDomains: ArchitectureDomain[];
  organizationUnits: OrganizationUnit[];
}

function RelationshipRow({
  relationship,
  otherBlockId,
  otherBlockName,
  onDelete,
}: {
  relationship: BuildingBlockRelationship;
  otherBlockId: string;
  otherBlockName: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {RELATIONSHIP_TYPE_LABEL[relationship.type]}
          </span>
          <Link
            to="/building-blocks/$buildingBlockId"
            params={{ buildingBlockId: otherBlockId }}
            className="truncate font-medium text-foreground hover:underline"
          >
            {otherBlockName}
          </Link>
        </div>
        {relationship.description && (
          <p className="truncate text-muted-foreground">{relationship.description}</p>
        )}
        {(relationship.validFrom || relationship.validTo) && (
          <p className="text-muted-foreground">
            {formatValidity(relationship.validFrom, relationship.validTo)}
          </p>
        )}
      </div>
      <WriteOnly>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:text-destructive"
          onClick={onDelete}
          aria-label={`Delete relationship to ${otherBlockName}`}
        >
          <Trash2 />
        </Button>
      </WriteOnly>
    </div>
  );
}

interface RelationshipFormState {
  targetBuildingBlockId: string;
  type: BuildingBlockRelationshipType;
  description: string;
  validFrom: string;
  validTo: string;
}

const emptyRelationshipForm: RelationshipFormState = {
  targetBuildingBlockId: '',
  type: 'DEPENDS_ON',
  description: '',
  validFrom: '',
  validTo: '',
};

function BuildingBlockRoute() {
  const { buildingBlockId } = Route.useParams();
  const { enterprise } = useEnterprise();
  const { data, loading, error, refetch } = useQuery<BuildingBlockDetailData>(
    BUILDING_BLOCK_DETAIL_QUERY,
    { variables: { id: buildingBlockId, enterpriseId: enterprise?.id }, skip: !enterprise },
  );
  const [createRelationship, { error: createError }] = useMutation(
    CREATE_BUILDING_BLOCK_RELATIONSHIP,
  );
  const confirm = useConfirm();
  const [deleteRelationship] = useMutation(DELETE_BUILDING_BLOCK_RELATIONSHIP);
  const [deleteBuildingBlock] = useMutation(DELETE_BUILDING_BLOCK, {
    update(cache, _result, { variables }) {
      if (!variables?.id) return;
      cache.evict({
        id: cache.identify({ __typename: 'ArchitectureBuildingBlock', id: variables.id }),
      });
      cache.evict({
        id: cache.identify({ __typename: 'SolutionBuildingBlock', id: variables.id }),
      });
      cache.gc();
    },
  });
  const navigate = useNavigate();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<RelationshipFormState>(emptyRelationshipForm);

  const openCreate = () => {
    setForm(emptyRelationshipForm);
    setSheetOpen(true);
  };

  const handleCreate = async () => {
    if (!form.targetBuildingBlockId) return;
    await createRelationship({
      variables: {
        input: {
          sourceBuildingBlockId: buildingBlockId,
          targetBuildingBlockId: form.targetBuildingBlockId,
          type: form.type,
          description: form.description || null,
          validFrom: form.validFrom || null,
          validTo: form.validTo || null,
        },
      },
    });
    setSheetOpen(false);
    await refetch();
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: 'Delete this relationship?', destructive: true }))) return;
    await deleteRelationship({ variables: { id } });
    toast.success('Relationship deleted.');
    await refetch();
  };

  const handleDeleteBlock = async () => {
    const name = data?.buildingBlock?.name ?? 'this building block';
    if (!(await confirm({ title: `Delete "${name}"?`, destructive: true }))) return;
    await deleteBuildingBlock({ variables: { id: buildingBlockId } });
    toast.success(`"${name}" deleted.`);
    navigate({ to: '/building-blocks' });
  };

  // The query is skipped until the enterprise context resolves (e.g. on a
  // hard reload straight into this route) — `loading` alone doesn't cover
  // that gap, so treat it the same as loading rather than falling through to
  // "not found" before the query has even had a chance to run.
  if (loading || !enterprise)
    return (
      <div className={contentWidthClassName}>
        <DetailSkeleton />
      </div>
    );
  if (error)
    return (
      <div className={contentWidthClassName}>
        <p className="text-sm text-destructive">Failed to load building block.</p>
      </div>
    );
  if (!data?.buildingBlock) throw notFound();

  const block = data.buildingBlock;
  const kind = kindOf(block.__typename);
  const otherBlocks = data.buildingBlocks.filter((b) => b.id !== block.id);
  const nameById = new Map(data.buildingBlocks.map((b) => [b.id, b.name]));
  const domainNames = block.architectureDomainIds
    .map((id) => data.architectureDomains.find((d) => d.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const unitNames = block.organizationUnitLinks
    .map((l) => data.organizationUnits.find((u) => u.id === l.organizationUnitId)?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {block.icon && <ModelIcon id={block.icon} size={24} />}
            {block.name}
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {BUILDING_BLOCK_KIND_LABEL[kind]}
            </span>
          </span>
        }
        back={
          <Link to="/building-blocks" className={pageBackLinkClassName}>
            <ChevronLeft className="size-3.5" /> Building Blocks
          </Link>
        }
        action={
          <>
            <WriteOnly>
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            </WriteOnly>
            <WriteOnly>
              <Button variant="destructive" size="sm" onClick={handleDeleteBlock}>
                Delete
              </Button>
            </WriteOnly>
          </>
        }
      />

      {block.description && <p className={detailDescriptionClassName}>{block.description}</p>}

      <div className={detailFactsClassName}>
        <Fact label="Lifecycle" value={LIFECYCLE_LABEL[block.lifecyclePhase]} />
        {block.architectureLevel && (
          <Fact label="Level" value={ARCHITECTURE_LEVEL_LABEL[block.architectureLevel]} />
        )}
        <Fact label="Valid" value={formatValidity(block.validFrom, block.validTo)} />
        {domainNames.map((name) => (
          <Fact key={name} label="Domain" value={name} />
        ))}
        {unitNames.map((name) => (
          <Fact key={name} label="Unit" value={name} />
        ))}
      </div>

      <div className={detailCardGridClassName}>
        <TitledCard
          title="Outgoing relationships"
          subtitle="What this building block depends on, exchanges data with, or runs on"
          action={
            <WriteOnly>
              <Button
                variant="ghost"
                size="sm"
                onClick={openCreate}
                disabled={otherBlocks.length === 0}
                title={
                  otherBlocks.length === 0 ? 'No other building block to relate to yet' : undefined
                }
              >
                Add relationship
              </Button>
            </WriteOnly>
          }
        >
          {block.outgoingRelationships.length > 0 ? (
            block.outgoingRelationships.map((rel) => (
              <RelationshipRow
                key={rel.id}
                relationship={rel}
                otherBlockId={rel.targetBuildingBlockId}
                otherBlockName={nameById.get(rel.targetBuildingBlockId) ?? 'Unknown'}
                onDelete={() => handleDelete(rel.id)}
              />
            ))
          ) : (
            <EmptyState label="No relationships yet" />
          )}
        </TitledCard>

        <TitledCard
          title="Incoming relationships"
          subtitle="Other building blocks that depend on, exchange data with, or run on this one"
        >
          {block.incomingRelationships.length > 0 ? (
            block.incomingRelationships.map((rel) => (
              <RelationshipRow
                key={rel.id}
                relationship={rel}
                otherBlockId={rel.sourceBuildingBlockId}
                otherBlockName={nameById.get(rel.sourceBuildingBlockId) ?? 'Unknown'}
                onDelete={() => handleDelete(rel.id)}
              />
            ))
          ) : (
            <EmptyState label="No relationships yet" />
          )}
        </TitledCard>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New relationship</SheetTitle>
            <SheetDescription>
              From {block.name} to another building block in this enterprise.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-6 py-2">
            <label
              htmlFor="rel-target-block"
              className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
            >
              Target building block
              <Select
                value={form.targetBuildingBlockId || SELECT_EMPTY_VALUE}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    targetBuildingBlockId: v === SELECT_EMPTY_VALUE ? '' : v,
                  })
                }
              >
                <SelectTrigger id="rel-target-block" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY_VALUE}>Not set</SelectItem>
                  {otherBlocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({BUILDING_BLOCK_KIND_LABEL[kindOf(b.__typename)]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label
              htmlFor="rel-type"
              className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
            >
              Type
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm({ ...form, type: v as BuildingBlockRelationshipType })
                }
              >
                <SelectTrigger id="rel-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RELATIONSHIP_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label
              htmlFor="rel-description"
              className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
            >
              Description
              <Textarea
                id="rel-description"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label
                htmlFor="rel-valid-from"
                className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
              >
                Valid from
                <Input
                  id="rel-valid-from"
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
              </label>
              <label
                htmlFor="rel-valid-to"
                className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
              >
                Valid to
                <Input
                  id="rel-valid-to"
                  type="date"
                  value={form.validTo}
                  onChange={(e) => setForm({ ...form, validTo: e.target.value })}
                />
              </label>
            </div>
          </div>

          {createError && <p className="px-6 text-sm text-destructive">{createError.message}</p>}

          <SheetFooter>
            <Button onClick={handleCreate} disabled={!form.targetBuildingBlockId}>
              Add relationship
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <BuildingBlockFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        enterpriseId={enterprise.id}
        block={block}
        domains={data.architectureDomains}
        organizationUnits={data.organizationUnits}
        onSaved={() => void refetch()}
      />
    </div>
  );
}

export const Route = createFileRoute('/building-blocks/$buildingBlockId')({
  component: BuildingBlockRoute,
});
