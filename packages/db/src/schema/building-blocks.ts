import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { architectureDomains } from './architecture-domains';
import { businessCapabilities } from './business-capabilities';
import { enterprises } from './enterprises';
import { timestamps, validityCheck } from './helpers';
import { organizationUnits } from './organization-units';

export const buildingBlockKind = pgEnum('building_block_kind', ['architecture', 'solution']);

// TOGAF levels of the Architecture Landscape ("depth"); applies to ABBs only.
export const architectureLevel = pgEnum('architecture_level', [
  'strategic',
  'segment',
  'capability',
]);

export const lifecyclePhase = pgEnum('lifecycle_phase', [
  'planned',
  'active',
  'phasing_out',
  'retired',
]);

// Kept deliberately small — a generic 'depends_on' plus 'data_flow' rather
// than a full ArchiMate-style taxonomy (serving/triggering/access/...).
// Richer typing can follow once real usage shows which distinctions matter.
// 'hosted_on' is the odd one out: containment ("runs on"), not a peer
// relationship — a block should have at most one *active* hosted_on edge at
// a time (enforced in the service layer), unlike depends_on/data_flow which
// are naturally many-to-many.
export const buildingBlockRelationshipType = pgEnum('building_block_relationship_type', [
  'depends_on',
  'data_flow',
  'hosted_on',
]);

// A single table for both ABBs and SBBs (discriminated by `kind`) so every
// relationship table has one FK target. `architectureLevel` is meaningful only
// for kind = 'architecture'; the service layer enforces that.
// `validFrom`/`validTo` bound the block's existence on the timeline ("time"
// dimension); null means unbounded on that side.
export const buildingBlocks = pgTable(
  'building_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    kind: buildingBlockKind('kind').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    // An Iconify icon id ("simple-icons:postgresql", "lucide:database") the
    // user picked to make the block recognisable in lists and diagrams. A
    // stable id, never markup or a URL; the API validates the shape and the
    // collection (D-22). Null means no icon chosen.
    icon: text('icon'),
    architectureLevel: architectureLevel('architecture_level'),
    lifecyclePhase: lifecyclePhase('lifecycle_phase').notNull().default('planned'),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    ...timestamps,
  },
  (t) => [
    index('building_blocks_enterprise_id_idx').on(t.enterpriseId),
    validityCheck('building_blocks', t.validFrom, t.validTo),
    // INV-3 at the database: a level only on architecture building blocks.
    check(
      'building_blocks_level_only_for_architecture_check',
      sql`${t.architectureLevel} IS NULL OR ${t.kind} = 'architecture'`,
    ),
  ],
);

// Domain assignment is classification, not history — no validity interval.
// "At least one domain per building block" is enforced in the service layer.
export const buildingBlockArchitectureDomains = pgTable(
  'building_block_architecture_domains',
  {
    buildingBlockId: uuid('building_block_id')
      .notNull()
      .references(() => buildingBlocks.id, { onDelete: 'cascade' }),
    architectureDomainId: uuid('architecture_domain_id')
      .notNull()
      .references(() => architectureDomains.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.buildingBlockId, t.architectureDomainId] }),
    index('building_block_architecture_domains_domain_id_idx').on(t.architectureDomainId),
  ],
);

// The three tables below are temporal relationships: instead of updating a
// row when an assignment changes, the old row is closed (validTo set) and a
// new row inserted, so the landscape can be reconstructed for any date.
// Overlapping intervals for the same pair are prevented in the service layer.
export const buildingBlockOrganizationUnits = pgTable(
  'building_block_organization_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingBlockId: uuid('building_block_id')
      .notNull()
      .references(() => buildingBlocks.id, { onDelete: 'cascade' }),
    organizationUnitId: uuid('organization_unit_id')
      .notNull()
      .references(() => organizationUnits.id, { onDelete: 'cascade' }),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    ...timestamps,
  },
  (t) => [
    index('building_block_organization_units_building_block_id_idx').on(t.buildingBlockId),
    index('building_block_organization_units_organization_unit_id_idx').on(t.organizationUnitId),
    validityCheck('building_block_organization_units', t.validFrom, t.validTo),
  ],
);

// ABB -> SBB: which solution building blocks realize an architecture
// building block. Both columns reference building_blocks; the service layer
// enforces the kinds.
export const buildingBlockRealizations = pgTable(
  'building_block_realizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    architectureBuildingBlockId: uuid('architecture_building_block_id')
      .notNull()
      .references(() => buildingBlocks.id, { onDelete: 'cascade' }),
    solutionBuildingBlockId: uuid('solution_building_block_id')
      .notNull()
      .references(() => buildingBlocks.id, { onDelete: 'cascade' }),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    ...timestamps,
  },
  (t) => [
    index('building_block_realizations_architecture_id_idx').on(t.architectureBuildingBlockId),
    index('building_block_realizations_solution_id_idx').on(t.solutionBuildingBlockId),
    validityCheck('building_block_realizations', t.validFrom, t.validTo),
    check(
      'building_block_realizations_distinct_ends_check',
      sql`${t.architectureBuildingBlockId} <> ${t.solutionBuildingBlockId}`,
    ),
  ],
);

// Which business capabilities an ABB serves — evolves over time.
export const buildingBlockCapabilities = pgTable(
  'building_block_capabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingBlockId: uuid('building_block_id')
      .notNull()
      .references(() => buildingBlocks.id, { onDelete: 'cascade' }),
    capabilityId: uuid('capability_id')
      .notNull()
      .references(() => businessCapabilities.id, { onDelete: 'cascade' }),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    ...timestamps,
  },
  (t) => [
    index('building_block_capabilities_building_block_id_idx').on(t.buildingBlockId),
    index('building_block_capabilities_capability_id_idx').on(t.capabilityId),
    validityCheck('building_block_capabilities', t.validFrom, t.validTo),
  ],
);

// Free-standing graph edges between any two building blocks (ABB or SBB),
// independent of realization/capability/domain assignment. Source depends on
// / receives data from target. This is the edge set a diagram view lays out
// with an auto-layout algorithm rather than the manually-positioned shapes a
// tool like draw.io produces.
export const buildingBlockRelationships = pgTable(
  'building_block_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceBuildingBlockId: uuid('source_building_block_id')
      .notNull()
      .references(() => buildingBlocks.id, { onDelete: 'cascade' }),
    targetBuildingBlockId: uuid('target_building_block_id')
      .notNull()
      .references(() => buildingBlocks.id, { onDelete: 'cascade' }),
    type: buildingBlockRelationshipType('type').notNull().default('depends_on'),
    description: text('description'),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    ...timestamps,
  },
  (t) => [
    index('building_block_relationships_source_id_idx').on(t.sourceBuildingBlockId),
    index('building_block_relationships_target_id_idx').on(t.targetBuildingBlockId),
    validityCheck('building_block_relationships', t.validFrom, t.validTo),
    // INV-4 at the database.
    check(
      'building_block_relationships_no_self_check',
      sql`${t.sourceBuildingBlockId} <> ${t.targetBuildingBlockId}`,
    ),
    // INV-5 at the database: one *open* hosted_on edge per source block.
    uniqueIndex('building_block_relationships_one_open_host_idx')
      .on(t.sourceBuildingBlockId)
      .where(sql`${t.type} = 'hosted_on' AND ${t.validTo} IS NULL`),
  ],
);

export const buildingBlocksRelations = relations(buildingBlocks, ({ many }) => ({
  architectureDomainLinks: many(buildingBlockArchitectureDomains),
  organizationUnitLinks: many(buildingBlockOrganizationUnits),
  realizedBy: many(buildingBlockRealizations, { relationName: 'realizationArchitectureSide' }),
  realizes: many(buildingBlockRealizations, { relationName: 'realizationSolutionSide' }),
  capabilityLinks: many(buildingBlockCapabilities),
  outgoingRelationships: many(buildingBlockRelationships, { relationName: 'relationshipSource' }),
  incomingRelationships: many(buildingBlockRelationships, { relationName: 'relationshipTarget' }),
}));

export const buildingBlockArchitectureDomainsRelations = relations(
  buildingBlockArchitectureDomains,
  ({ one }) => ({
    buildingBlock: one(buildingBlocks, {
      fields: [buildingBlockArchitectureDomains.buildingBlockId],
      references: [buildingBlocks.id],
    }),
    architectureDomain: one(architectureDomains, {
      fields: [buildingBlockArchitectureDomains.architectureDomainId],
      references: [architectureDomains.id],
    }),
  }),
);

export const buildingBlockOrganizationUnitsRelations = relations(
  buildingBlockOrganizationUnits,
  ({ one }) => ({
    buildingBlock: one(buildingBlocks, {
      fields: [buildingBlockOrganizationUnits.buildingBlockId],
      references: [buildingBlocks.id],
    }),
    organizationUnit: one(organizationUnits, {
      fields: [buildingBlockOrganizationUnits.organizationUnitId],
      references: [organizationUnits.id],
    }),
  }),
);

export const buildingBlockRealizationsRelations = relations(
  buildingBlockRealizations,
  ({ one }) => ({
    architectureBuildingBlock: one(buildingBlocks, {
      fields: [buildingBlockRealizations.architectureBuildingBlockId],
      references: [buildingBlocks.id],
      relationName: 'realizationArchitectureSide',
    }),
    solutionBuildingBlock: one(buildingBlocks, {
      fields: [buildingBlockRealizations.solutionBuildingBlockId],
      references: [buildingBlocks.id],
      relationName: 'realizationSolutionSide',
    }),
  }),
);

export const buildingBlockCapabilitiesRelations = relations(
  buildingBlockCapabilities,
  ({ one }) => ({
    buildingBlock: one(buildingBlocks, {
      fields: [buildingBlockCapabilities.buildingBlockId],
      references: [buildingBlocks.id],
    }),
    capability: one(businessCapabilities, {
      fields: [buildingBlockCapabilities.capabilityId],
      references: [businessCapabilities.id],
    }),
  }),
);

export const buildingBlockRelationshipsRelations = relations(
  buildingBlockRelationships,
  ({ one }) => ({
    source: one(buildingBlocks, {
      fields: [buildingBlockRelationships.sourceBuildingBlockId],
      references: [buildingBlocks.id],
      relationName: 'relationshipSource',
    }),
    target: one(buildingBlocks, {
      fields: [buildingBlockRelationships.targetBuildingBlockId],
      references: [buildingBlocks.id],
      relationName: 'relationshipTarget',
    }),
  }),
);
