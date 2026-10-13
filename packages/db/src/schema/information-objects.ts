import { relations, sql } from 'drizzle-orm';
import { date, index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { businessCapabilities } from './business-capabilities';
import { enterprises } from './enterprises';
import { timestamps, validityCheck } from './helpers';

// How a capability relates to a piece of information. Deliberately three
// values rather than a CRUD matrix, for the same reason the building block
// relationship taxonomy is small (see docs/DECISIONS.md D-3): richer typing
// should follow real usage showing which distinctions matter. 'owns' is the
// one that carries weight — it names the capability accountable for the
// information being correct, which is the question nobody can usually answer.
export const informationUsage = pgEnum('information_usage', ['owns', 'creates', 'uses']);

// Business information: what the enterprise knows about, in business language
// and independent of any system that happens to hold it — "Expense Claim",
// "Customer Master Data". Deliberately ONE level: there is no separate
// system-level data object realizing a concept the way an SBB realizes an ABB.
// That symmetry is tempting and was declined on purpose; see docs/DECISIONS.md.
export const informationObjects = pgTable(
  'information_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => [index('information_objects_enterprise_id_idx').on(t.enterpriseId)],
);

// Temporal, like every other link from a capability to something else: a
// capability starts and stops relying on information over time, and closing
// the old row rather than updating it is what keeps the model reconstructible
// for a past date.
export const capabilityInformation = pgTable(
  'capability_information',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    capabilityId: uuid('capability_id')
      .notNull()
      .references(() => businessCapabilities.id, { onDelete: 'cascade' }),
    informationObjectId: uuid('information_object_id')
      .notNull()
      .references(() => informationObjects.id, { onDelete: 'cascade' }),
    usage: informationUsage('usage').notNull().default('uses'),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    ...timestamps,
  },
  (t) => [
    index('capability_information_capability_id_idx').on(t.capabilityId),
    index('capability_information_information_object_id_idx').on(t.informationObjectId),
    validityCheck('capability_information', t.validFrom, t.validTo),
    // INV-12 at the database: one *open* link per capability and object.
    uniqueIndex('capability_information_one_open_per_pair_idx')
      .on(t.capabilityId, t.informationObjectId)
      .where(sql`${t.validTo} IS NULL`),
  ],
);

export const informationObjectsRelations = relations(informationObjects, ({ many }) => ({
  capabilityLinks: many(capabilityInformation),
}));

export const capabilityInformationRelations = relations(capabilityInformation, ({ one }) => ({
  capability: one(businessCapabilities, {
    fields: [capabilityInformation.capabilityId],
    references: [businessCapabilities.id],
  }),
  informationObject: one(informationObjects, {
    fields: [capabilityInformation.informationObjectId],
    references: [informationObjects.id],
  }),
}));
