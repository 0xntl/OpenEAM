import { relations } from 'drizzle-orm';
import { foreignKey, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { businessCapabilities } from './business-capabilities';
import { enterprises } from './enterprises';
import { timestamps } from './helpers';

export const businessProcesses = pgTable(
  'business_processes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Kept in sync with the owning capability's enterprise by the service
    // layer, so processes can be filtered by enterprise without a join.
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    capabilityId: uuid('capability_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    triggerEvent: text('trigger_event'),
    outcome: text('outcome'),
    // BPMN 2.0 XML of the process diagram (bpmn-js native format); the
    // diagram is the source of truth for process_steps, which are synced
    // from it on every diagram save.
    bpmnXml: text('bpmn_xml'),
    ...timestamps,
  },
  (t) => [
    index('business_processes_capability_id_idx').on(t.capabilityId),
    index('business_processes_enterprise_id_idx').on(t.enterpriseId),
    // INV-6 at the database: the capability must exist *in this enterprise*.
    // A plain FK on capability_id alone would accept one from anywhere.
    foreignKey({
      name: 'business_processes_capability_fk',
      columns: [t.capabilityId, t.enterpriseId],
      foreignColumns: [businessCapabilities.id, businessCapabilities.enterpriseId],
    }).onDelete('cascade'),
  ],
);

export const processSteps = pgTable(
  'process_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    processId: uuid('process_id')
      .notNull()
      .references(() => businessProcesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('process_steps_process_id_idx').on(t.processId),
    unique('process_steps_process_id_position_unique').on(t.processId, t.position),
  ],
);

export const businessProcessesRelations = relations(businessProcesses, ({ one, many }) => ({
  capability: one(businessCapabilities, {
    fields: [businessProcesses.capabilityId],
    references: [businessCapabilities.id],
  }),
  steps: many(processSteps),
}));

export const processStepsRelations = relations(processSteps, ({ one }) => ({
  process: one(businessProcesses, {
    fields: [processSteps.processId],
    references: [businessProcesses.id],
  }),
}));
