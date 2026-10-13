import { relations, sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { buildingBlockOrganizationUnits } from './building-blocks';
import { enterprises } from './enterprises';
import { timestamps } from './helpers';

// The "breadth" dimension of the landscape: a hierarchical tree of
// organization units (division > department > team > ...) as modeled from
// one enterprise's perspective.
export const organizationUnits = pgTable(
  'organization_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    parentId: uuid('parent_id'),
    ...timestamps,
  },
  (t) => [
    index('organization_units_parent_id_idx').on(t.parentId),
    index('organization_units_enterprise_id_idx').on(t.enterpriseId),
    unique('organization_units_id_enterprise_id_unique').on(t.id, t.enterpriseId),
    // The parent has to be a unit of the same enterprise; deleting a parent
    // takes its subtree with it.
    foreignKey({
      name: 'organization_units_parent_fk',
      columns: [t.parentId, t.enterpriseId],
      foreignColumns: [t.id, t.enterpriseId],
    }).onDelete('cascade'),
    check('organization_units_not_own_parent_check', sql`${t.parentId} IS DISTINCT FROM ${t.id}`),
  ],
);

export const organizationUnitsRelations = relations(organizationUnits, ({ one, many }) => ({
  parent: one(organizationUnits, {
    fields: [organizationUnits.parentId],
    references: [organizationUnits.id],
    relationName: 'organizationUnitHierarchy',
  }),
  children: many(organizationUnits, { relationName: 'organizationUnitHierarchy' }),
  buildingBlockOrganizationUnits: many(buildingBlockOrganizationUnits),
}));
