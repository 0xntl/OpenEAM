import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { capabilityActors } from './actors';
import { buildingBlockCapabilities } from './building-blocks';
import { businessProcesses } from './business-processes';
import { enterprises } from './enterprises';
import { timestamps } from './helpers';
import { capabilityInformation } from './information-objects';
import { stageCapabilities } from './value-streams';

// The strategic-architecture "framework for change activity" TOGAF talks
// about: where investment goes, where it deliberately doesn't. Nullable —
// most capabilities won't carry a direction until someone at that altitude
// sets one; a null one just hasn't been decided yet, not "sustain" by default.
export const capabilityDirection = pgEnum('capability_direction', [
  'invest',
  'sustain',
  'commodity',
  'sunset',
]);

export const businessCapabilities = pgTable(
  'business_capabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    direction: capabilityDirection('direction'),
    ...timestamps,
  },
  (t) => [
    index('business_capabilities_enterprise_id_idx').on(t.enterpriseId),
    // Lets child rows reference (id, enterprise_id) together, so the database
    // itself refuses a process whose capability sits in another enterprise.
    unique('business_capabilities_id_enterprise_id_unique').on(t.id, t.enterpriseId),
  ],
);

export const businessCapabilitiesRelations = relations(businessCapabilities, ({ many }) => ({
  businessProcesses: many(businessProcesses),
  stageCapabilities: many(stageCapabilities),
  buildingBlockLinks: many(buildingBlockCapabilities),
  informationLinks: many(capabilityInformation),
  actorLinks: many(capabilityActors),
}));
