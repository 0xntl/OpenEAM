import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { buildingBlockArchitectureDomains } from './building-blocks';
import { enterprises } from './enterprises';
import { timestamps } from './helpers';

// Architecture domains are data, not an enum: the four TOGAF BDAT domains are
// seeded as defaults per enterprise (isDefault = true), and each enterprise
// can add its own (e.g. security architecture, integration architecture).
export const architectureDomains = pgTable(
  'architecture_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique('architecture_domains_enterprise_id_name_unique').on(t.enterpriseId, t.name),
    index('architecture_domains_enterprise_id_idx').on(t.enterpriseId),
  ],
);

export const architectureDomainsRelations = relations(architectureDomains, ({ many }) => ({
  buildingBlockArchitectureDomains: many(buildingBlockArchitectureDomains),
}));
