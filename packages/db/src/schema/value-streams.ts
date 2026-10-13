import { relations } from 'drizzle-orm';
import { index, integer, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { businessCapabilities } from './business-capabilities';
import { enterprises } from './enterprises';
import { timestamps } from './helpers';

export const valueStreams = pgTable(
  'value_streams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (t) => [index('value_streams_enterprise_id_idx').on(t.enterpriseId)],
);

export const valueStreamStages = pgTable(
  'value_stream_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    valueStreamId: uuid('value_stream_id')
      .notNull()
      .references(() => valueStreams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('value_stream_stages_value_stream_id_idx').on(t.valueStreamId),
    unique('value_stream_stages_value_stream_id_position_unique').on(t.valueStreamId, t.position),
  ],
);

export const stageCapabilities = pgTable(
  'stage_capabilities',
  {
    stageId: uuid('stage_id')
      .notNull()
      .references(() => valueStreamStages.id, { onDelete: 'cascade' }),
    capabilityId: uuid('capability_id')
      .notNull()
      .references(() => businessCapabilities.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.stageId, t.capabilityId] }),
    index('stage_capabilities_capability_id_idx').on(t.capabilityId),
    unique('stage_capabilities_stage_id_position_unique').on(t.stageId, t.position),
  ],
);

export const valueStreamsRelations = relations(valueStreams, ({ many }) => ({
  stages: many(valueStreamStages),
}));

export const valueStreamStagesRelations = relations(valueStreamStages, ({ one, many }) => ({
  valueStream: one(valueStreams, {
    fields: [valueStreamStages.valueStreamId],
    references: [valueStreams.id],
  }),
  stageCapabilities: many(stageCapabilities),
}));

export const stageCapabilitiesRelations = relations(stageCapabilities, ({ one }) => ({
  stage: one(valueStreamStages, {
    fields: [stageCapabilities.stageId],
    references: [valueStreamStages.id],
  }),
  capability: one(businessCapabilities, {
    fields: [stageCapabilities.capabilityId],
    references: [businessCapabilities.id],
  }),
}));
