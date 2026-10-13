import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database, Transaction } from '@openeam/db';
import { and, eq, inArray, schema } from '@openeam/db';
import { assertCan } from '../auth/policy';
import { assertEnterpriseAccess, type Principal } from '../auth/principal';
import {
  ARCHITECTURE_LEVEL_MESSAGE,
  architectureLevelAllowed,
  INTERVAL_MESSAGE,
  isHalfOpenInterval,
} from '../common/invariants';
import { DATABASE } from '../db.module';
import { ICON_ID_MESSAGE, isIconId } from '../icons/icon-id';
import type {
  ArchitectureBuildingBlock,
  ArchitectureLevel,
  BuildingBlockInput,
  BuildingBlockRelationship,
  BuildingBlockRelationshipInput,
  LifecyclePhase,
  SolutionBuildingBlock,
} from './building-block.model';

// The viewpoint the user chose: depth (level), breadth (organization unit),
// architecture domain, and time (asOf, an ISO date). A landscape is the set
// of building blocks visible from that viewpoint — not an entity of its own.
export interface LandscapeFilter {
  enterpriseId: string;
  asOf?: string;
  architectureLevel?: ArchitectureLevel;
  architectureDomainId?: string;
  organizationUnitId?: string;
}

interface TemporalRow {
  validFrom: string | null;
  validTo: string | null;
}

interface BuildingBlockRow extends TemporalRow {
  id: string;
  enterpriseId: string;
  kind: 'architecture' | 'solution';
  name: string;
  description: string | null;
  icon: string | null;
  architectureLevel: 'strategic' | 'segment' | 'capability' | null;
  lifecyclePhase: 'planned' | 'active' | 'phasing_out' | 'retired';
  architectureDomainLinks: Array<{ architectureDomainId: string }>;
  organizationUnitLinks: Array<TemporalRow & { organizationUnitId: string }>;
  capabilityLinks: Array<TemporalRow & { capabilityId: string }>;
  realizedBy: Array<
    TemporalRow & { architectureBuildingBlockId: string; solutionBuildingBlockId: string }
  >;
  realizes: Array<
    TemporalRow & { architectureBuildingBlockId: string; solutionBuildingBlockId: string }
  >;
  outgoingRelationships: Array<
    TemporalRow & {
      id: string;
      sourceBuildingBlockId: string;
      targetBuildingBlockId: string;
      type: 'depends_on' | 'data_flow' | 'hosted_on';
      description: string | null;
    }
  >;
  incomingRelationships: Array<
    TemporalRow & {
      id: string;
      sourceBuildingBlockId: string;
      targetBuildingBlockId: string;
      type: 'depends_on' | 'data_flow' | 'hosted_on';
      description: string | null;
    }
  >;
}

// ISO dates (YYYY-MM-DD) compare correctly as strings. Half-open interval:
// validFrom inclusive, validTo exclusive; null means unbounded on that side.
function isValidAt(row: TemporalRow, asOf: string): boolean {
  return (
    (row.validFrom === null || row.validFrom <= asOf) &&
    (row.validTo === null || row.validTo > asOf)
  );
}

// The GraphQL layer resolves the concrete type from `kind` (see
// building-block.model.ts), so mapped objects keep it even though it is not
// itself a GraphQL field.
export type MappedBuildingBlock = (ArchitectureBuildingBlock | SolutionBuildingBlock) & {
  kind: 'architecture' | 'solution';
};

export function toBuildingBlock(row: BuildingBlockRow, asOf?: string): MappedBuildingBlock {
  const linkFilter = asOf ? (link: TemporalRow) => isValidAt(link, asOf) : () => true;
  return {
    kind: row.kind,
    id: row.id,
    enterpriseId: row.enterpriseId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    architectureLevel: row.architectureLevel as ArchitectureLevel | null,
    lifecyclePhase: row.lifecyclePhase as LifecyclePhase,
    validFrom: row.validFrom,
    validTo: row.validTo,
    architectureDomainIds: row.architectureDomainLinks.map((l) => l.architectureDomainId),
    organizationUnitLinks: row.organizationUnitLinks.filter(linkFilter),
    capabilityLinks: row.capabilityLinks.filter(linkFilter),
    realizedBy: row.realizedBy.filter(linkFilter),
    realizes: row.realizes.filter(linkFilter),
    outgoingRelationships: row.outgoingRelationships.filter(
      linkFilter,
    ) as BuildingBlockRelationship[],
    incomingRelationships: row.incomingRelationships.filter(
      linkFilter,
    ) as BuildingBlockRelationship[],
  };
}

export const withAllLinks = {
  architectureDomainLinks: true,
  organizationUnitLinks: true,
  capabilityLinks: true,
  realizedBy: true,
  realizes: true,
  outgoingRelationships: true,
  incomingRelationships: true,
} as const;

@Injectable()
export class BuildingBlocksService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findAll(principal: Principal, enterpriseId: string): Promise<MappedBuildingBlock[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    const rows = await this.db.query.buildingBlocks.findMany({
      where: (t, { eq }) => eq(t.enterpriseId, enterpriseId),
      with: withAllLinks,
      orderBy: (t, { asc }) => [asc(t.name)],
    });
    return rows.map((row) => toBuildingBlock(row));
  }

  // Scoped to the caller's enterprises (INV-16).
  async findOne(principal: Principal, id: string): Promise<MappedBuildingBlock | undefined> {
    const row = await this.db.query.buildingBlocks.findFirst({
      where: (t, { and, eq, inArray }) =>
        and(eq(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
      with: withAllLinks,
    });
    return row ? toBuildingBlock(row) : undefined;
  }

  async create(principal: Principal, input: BuildingBlockInput): Promise<MappedBuildingBlock> {
    assertCan(principal, 'model.write', input.enterpriseId);
    this.validateInput(input);
    await this.validateReferences(input, input.enterpriseId);

    const id = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schema.buildingBlocks)
        .values({
          enterpriseId: input.enterpriseId,
          kind: input.kind,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon ?? null,
          architectureLevel:
            input.kind === 'architecture' ? (input.architectureLevel ?? null) : null,
          lifecyclePhase: input.lifecyclePhase,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        })
        .returning({ id: schema.buildingBlocks.id });

      if (!inserted) throw new NotFoundException('Building block insert returned no row');
      await this.replaceAssignments(tx, inserted.id, input);
      return inserted.id;
    });

    const created = await this.findOne(principal, id);
    if (!created) throw new NotFoundException(`Building block ${id} not found after creation`);
    return created;
  }

  // enterpriseId is not updatable; references are checked against the
  // stored enterprise, not whatever the input claims.
  async update(
    principal: Principal,
    id: string,
    input: BuildingBlockInput,
  ): Promise<MappedBuildingBlock> {
    this.validateInput(input);
    const existing = await this.findOne(principal, id);
    if (!existing) throw new NotFoundException(`Building block ${id} not found`);
    assertCan(principal, 'model.write', existing.enterpriseId);
    await this.validateReferences(input, existing.enterpriseId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.buildingBlocks)
        .set({
          kind: input.kind,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon ?? null,
          architectureLevel:
            input.kind === 'architecture' ? (input.architectureLevel ?? null) : null,
          lifecyclePhase: input.lifecyclePhase,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        })
        .where(eq(schema.buildingBlocks.id, id));
      await this.replaceAssignments(tx, id, input);
    });

    const updated = await this.findOne(principal, id);
    if (!updated) throw new NotFoundException(`Building block ${id} not found after update`);
    return updated;
  }

  async delete(principal: Principal, id: string): Promise<boolean> {
    const existing = await this.findOne(principal, id);
    if (!existing) return false;
    assertCan(principal, 'model.write', existing.enterpriseId);
    const [deleted] = await this.db
      .delete(schema.buildingBlocks)
      .where(
        and(
          eq(schema.buildingBlocks.id, id),
          inArray(schema.buildingBlocks.enterpriseId, principal.enterpriseIds),
        ),
      )
      .returning({ id: schema.buildingBlocks.id });
    return Boolean(deleted);
  }

  async createRelationship(
    principal: Principal,
    input: BuildingBlockRelationshipInput,
  ): Promise<BuildingBlockRelationship> {
    if (input.sourceBuildingBlockId === input.targetBuildingBlockId) {
      throw new BadRequestException('A building block cannot relate to itself');
    }
    if (!isHalfOpenInterval(input.validFrom, input.validTo)) {
      throw new BadRequestException(INTERVAL_MESSAGE);
    }

    // Both ends must be visible to the caller and sit in the same
    // enterprise (INV-9): a relationship never crosses the boundary.
    const ends = await this.db.query.buildingBlocks.findMany({
      where: (t, { and, inArray }) =>
        and(
          inArray(t.id, [input.sourceBuildingBlockId, input.targetBuildingBlockId]),
          inArray(t.enterpriseId, principal.enterpriseIds),
        ),
      columns: { id: true, enterpriseId: true },
    });
    const source = ends.find((b) => b.id === input.sourceBuildingBlockId);
    const target = ends.find((b) => b.id === input.targetBuildingBlockId);
    if (!source) {
      throw new BadRequestException(`Building block ${input.sourceBuildingBlockId} not found`);
    }
    if (!target) {
      throw new BadRequestException(`Building block ${input.targetBuildingBlockId} not found`);
    }
    if (source.enterpriseId !== target.enterpriseId) {
      throw new BadRequestException('Related building blocks must belong to the same enterprise');
    }
    assertCan(principal, 'model.write', source.enterpriseId);

    // hosted_on is containment ("runs on"), not a peer relationship like
    // depends_on/data_flow — a block can only run on one thing at a time, so
    // unlike those, it can't be many-to-many. Only checks for an existing
    // *unbounded* (validTo null) edge, not full interval overlap; closing
    // the old edge (setting its validTo) before opening a new one is on the
    // caller, same as every other temporal link in this schema.
    if (input.type === 'hosted_on' && !input.validTo) {
      const existingActiveParent = await this.db.query.buildingBlockRelationships.findFirst({
        where: (t, { and, eq, isNull }) =>
          and(
            eq(t.sourceBuildingBlockId, input.sourceBuildingBlockId),
            eq(t.type, 'hosted_on'),
            isNull(t.validTo),
          ),
      });
      if (existingActiveParent) {
        throw new BadRequestException(
          'This building block already has an active hosted_on relationship — close it (set validTo) before adding another',
        );
      }
    }

    const [created] = await this.db
      .insert(schema.buildingBlockRelationships)
      .values({
        sourceBuildingBlockId: input.sourceBuildingBlockId,
        targetBuildingBlockId: input.targetBuildingBlockId,
        type: input.type,
        description: input.description ?? null,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
      })
      .returning();

    if (!created) throw new NotFoundException('Building block relationship insert returned no row');
    return created as BuildingBlockRelationship;
  }

  // The edge has no enterpriseId of its own; it is scoped through its source.
  async deleteRelationship(principal: Principal, id: string): Promise<boolean> {
    const edge = await this.db.query.buildingBlockRelationships.findFirst({
      where: (t, { eq }) => eq(t.id, id),
      with: { source: { columns: { enterpriseId: true } } },
    });
    if (!edge || !principal.enterpriseIds.includes(edge.source.enterpriseId)) return false;
    assertCan(principal, 'model.write', edge.source.enterpriseId);

    const [deleted] = await this.db
      .delete(schema.buildingBlockRelationships)
      .where(eq(schema.buildingBlockRelationships.id, id))
      .returning({ id: schema.buildingBlockRelationships.id });
    return Boolean(deleted);
  }

  private validateInput(input: BuildingBlockInput): void {
    if (input.architectureDomainIds.length === 0) {
      throw new BadRequestException(
        'A building block must belong to at least one architecture domain',
      );
    }
    if (!architectureLevelAllowed(input.kind, input.architectureLevel)) {
      throw new BadRequestException(ARCHITECTURE_LEVEL_MESSAGE);
    }
    // INV-1 for the block's own validity.
    if (!isHalfOpenInterval(input.validFrom, input.validTo)) {
      throw new BadRequestException(INTERVAL_MESSAGE);
    }
    if (input.icon && !isIconId(input.icon)) {
      throw new BadRequestException(ICON_ID_MESSAGE);
    }
  }

  // INV-9: the domains and organization units a block is assigned to belong
  // to the block's own enterprise. Without this, an id guessed from another
  // enterprise would be accepted and the classification would quietly lie.
  private async validateReferences(input: BuildingBlockInput, enterpriseId: string) {
    const domainIds = [...new Set(input.architectureDomainIds)];
    const domains = await this.db.query.architectureDomains.findMany({
      where: (t, { and, eq, inArray }) =>
        and(inArray(t.id, domainIds), eq(t.enterpriseId, enterpriseId)),
      columns: { id: true },
    });
    if (domains.length !== domainIds.length) {
      throw new BadRequestException('Every architecture domain must belong to this enterprise');
    }

    const unitIds = [...new Set(input.organizationUnitIds)];
    if (unitIds.length === 0) return;
    const units = await this.db.query.organizationUnits.findMany({
      where: (t, { and, eq, inArray }) =>
        and(inArray(t.id, unitIds), eq(t.enterpriseId, enterpriseId)),
      columns: { id: true },
    });
    if (units.length !== unitIds.length) {
      throw new BadRequestException('Every organization unit must belong to this enterprise');
    }
  }

  // Domain and org-unit assignment are treated as a replace-all set here (no
  // validity interval) — see the note on BuildingBlockInput.
  private async replaceAssignments(
    tx: Transaction,
    buildingBlockId: string,
    input: BuildingBlockInput,
  ): Promise<void> {
    await tx
      .delete(schema.buildingBlockArchitectureDomains)
      .where(eq(schema.buildingBlockArchitectureDomains.buildingBlockId, buildingBlockId));
    await tx
      .delete(schema.buildingBlockOrganizationUnits)
      .where(eq(schema.buildingBlockOrganizationUnits.buildingBlockId, buildingBlockId));

    if (input.architectureDomainIds.length > 0) {
      await tx.insert(schema.buildingBlockArchitectureDomains).values(
        input.architectureDomainIds.map((architectureDomainId) => ({
          buildingBlockId,
          architectureDomainId,
        })),
      );
    }
    if (input.organizationUnitIds.length > 0) {
      await tx.insert(schema.buildingBlockOrganizationUnits).values(
        input.organizationUnitIds.map((organizationUnitId) => ({
          buildingBlockId,
          organizationUnitId,
          validFrom: null,
          validTo: null,
        })),
      );
    }
  }

  architectureLandscape(
    principal: Principal,
    filter: LandscapeFilter,
  ): Promise<MappedBuildingBlock[]> {
    assertEnterpriseAccess(principal, filter.enterpriseId);
    return this.landscape('architecture', filter);
  }

  solutionsLandscape(
    principal: Principal,
    filter: LandscapeFilter,
  ): Promise<MappedBuildingBlock[]> {
    assertEnterpriseAccess(principal, filter.enterpriseId);
    return this.landscape('solution', filter);
  }

  // Filters run in memory after a kind-scoped query; move them into SQL when
  // landscapes grow past what a single fetch handles comfortably.
  private async landscape(
    kind: 'architecture' | 'solution',
    filter: LandscapeFilter,
  ): Promise<MappedBuildingBlock[]> {
    const rows = await this.db.query.buildingBlocks.findMany({
      where: (t, { and, eq }) => and(eq(t.kind, kind), eq(t.enterpriseId, filter.enterpriseId)),
      with: withAllLinks,
      orderBy: (t, { asc }) => [asc(t.name)],
    });

    return rows
      .filter((row) => {
        if (filter.asOf && !isValidAt(row, filter.asOf)) return false;
        if (filter.architectureLevel && row.architectureLevel !== filter.architectureLevel) {
          return false;
        }
        if (
          filter.architectureDomainId &&
          !row.architectureDomainLinks.some(
            (l) => l.architectureDomainId === filter.architectureDomainId,
          )
        ) {
          return false;
        }
        if (filter.organizationUnitId) {
          // Exact unit match for now; expanding to descendant units in the
          // hierarchy is a follow-up.
          const links = row.organizationUnitLinks.filter(
            (l) => l.organizationUnitId === filter.organizationUnitId,
          );
          const visible = filter.asOf
            ? links.some((l) => isValidAt(l, filter.asOf as string))
            : links.length > 0;
          if (!visible) return false;
        }
        return true;
      })
      .map((row) => toBuildingBlock(row, filter.asOf));
  }
}
