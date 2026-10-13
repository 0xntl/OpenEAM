import { z } from 'zod';
import { ICON_ID_MESSAGE, isIconId } from '../icons/icon-id';

// Every id is a UUID (D-8, D-18): the columns are `uuid`, so the schema says
// so too and a malformed id is a 400 with a path, not a database error.

// Record timestamps: exported for round-trip fidelity, optional so bundles
// created before they existed still import (the DB fills defaults).
const timestampFields = {
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
};

// Validity interval of temporal rows (ISO dates, null = unbounded).
const validityFields = {
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
};

const enterpriseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  goal: z.string().nullable().optional(),
  avatarBgColor: z.string().nullable().optional(),
  avatarTextColor: z.string().nullable().optional(),
  ...timestampFields,
});

const businessCapabilitySchema = z.object({
  id: z.uuid(),
  enterpriseId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  direction: z.enum(['invest', 'sustain', 'commodity', 'sunset']).nullable().default(null),
  ...timestampFields,
});

const businessProcessSchema = z.object({
  id: z.uuid(),
  enterpriseId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  capabilityId: z.uuid(),
  triggerEvent: z.string().nullable(),
  outcome: z.string().nullable(),
  // Optional so bundles exported before the diagram column existed still import.
  bpmnXml: z.string().nullable().optional(),
  ...timestampFields,
});

const processStepSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  processId: z.uuid(),
  position: z.number().int(),
  ...timestampFields,
});

const valueStreamSchema = z.object({
  id: z.uuid(),
  enterpriseId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  ...timestampFields,
});

const valueStreamStageSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  valueStreamId: z.uuid(),
  position: z.number().int(),
  ...timestampFields,
});

const stageCapabilitySchema = z.object({
  stageId: z.uuid(),
  capabilityId: z.uuid(),
  position: z.number().int(),
});

const architectureDomainSchema = z.object({
  id: z.uuid(),
  enterpriseId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  ...timestampFields,
});

const organizationUnitSchema = z.object({
  id: z.uuid(),
  enterpriseId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  parentId: z.uuid().nullable(),
  ...timestampFields,
});

const actorSchema = z.object({
  id: z.uuid(),
  enterpriseId: z.uuid(),
  kind: z.enum(['role', 'team', 'individual', 'external']),
  name: z.string(),
  description: z.string().nullable(),
  organizationUnitId: z.uuid().nullable().optional().default(null),
  ...timestampFields,
});

const capabilityActorSchema = z.object({
  id: z.uuid(),
  capabilityId: z.uuid(),
  actorId: z.uuid(),
  involvement: z.enum(['accountable', 'performs', 'consulted']).default('performs'),
  ...validityFields,
  ...timestampFields,
});

const informationObjectSchema = z.object({
  id: z.uuid(),
  enterpriseId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  ...timestampFields,
});

const capabilityInformationSchema = z.object({
  id: z.uuid(),
  capabilityId: z.uuid(),
  informationObjectId: z.uuid(),
  usage: z.enum(['owns', 'creates', 'uses']).default('uses'),
  ...validityFields,
  ...timestampFields,
});

const buildingBlockSchema = z.object({
  id: z.uuid(),
  enterpriseId: z.uuid(),
  kind: z.enum(['architecture', 'solution']),
  name: z.string(),
  description: z.string().nullable(),
  // Optional so bundles exported before icons existed still import. The
  // collection must be one this instance serves; the name is not checked
  // against the set (see icon-id.ts).
  icon: z.string().refine(isIconId, ICON_ID_MESSAGE).nullable().optional().default(null),
  architectureLevel: z.enum(['strategic', 'segment', 'capability']).nullable(),
  lifecyclePhase: z.enum(['planned', 'active', 'phasing_out', 'retired']),
  ...validityFields,
  ...timestampFields,
});

const buildingBlockArchitectureDomainSchema = z.object({
  buildingBlockId: z.uuid(),
  architectureDomainId: z.uuid(),
});

const buildingBlockOrganizationUnitSchema = z.object({
  id: z.uuid(),
  buildingBlockId: z.uuid(),
  organizationUnitId: z.uuid(),
  ...validityFields,
  ...timestampFields,
});

const buildingBlockRealizationSchema = z.object({
  id: z.uuid(),
  architectureBuildingBlockId: z.uuid(),
  solutionBuildingBlockId: z.uuid(),
  ...validityFields,
  ...timestampFields,
});

const buildingBlockCapabilitySchema = z.object({
  id: z.uuid(),
  buildingBlockId: z.uuid(),
  capabilityId: z.uuid(),
  ...validityFields,
  ...timestampFields,
});

const buildingBlockRelationshipSchema = z.object({
  id: z.uuid(),
  sourceBuildingBlockId: z.uuid(),
  targetBuildingBlockId: z.uuid(),
  type: z.enum(['depends_on', 'data_flow', 'hosted_on']),
  description: z.string().nullable(),
  ...validityFields,
  ...timestampFields,
});

export const dataBundleSchema = z.object({
  // The enterprises this bundle carries; import replaces exactly these
  // enterprises' models and touches nothing else.
  enterprises: z.array(enterpriseSchema),
  businessCapabilities: z.array(businessCapabilitySchema),
  businessProcesses: z.array(businessProcessSchema),
  processSteps: z.array(processStepSchema),
  valueStreams: z.array(valueStreamSchema),
  valueStreamStages: z.array(valueStreamStageSchema),
  stageCapabilities: z.array(stageCapabilitySchema),
  // Optional (with defaults) so bundles exported before the landscape tables
  // existed still import.
  architectureDomains: z.array(architectureDomainSchema).default([]),
  organizationUnits: z.array(organizationUnitSchema).default([]),
  buildingBlocks: z.array(buildingBlockSchema).default([]),
  buildingBlockArchitectureDomains: z.array(buildingBlockArchitectureDomainSchema).default([]),
  buildingBlockOrganizationUnits: z.array(buildingBlockOrganizationUnitSchema).default([]),
  buildingBlockRealizations: z.array(buildingBlockRealizationSchema).default([]),
  buildingBlockCapabilities: z.array(buildingBlockCapabilitySchema).default([]),
  buildingBlockRelationships: z.array(buildingBlockRelationshipSchema).default([]),
  // Optional with defaults for the same reason as the landscape tables above:
  // bundles exported before information objects existed still import.
  informationObjects: z.array(informationObjectSchema).default([]),
  capabilityInformation: z.array(capabilityInformationSchema).default([]),
  actors: z.array(actorSchema).default([]),
  capabilityActors: z.array(capabilityActorSchema).default([]),
});

export type DataBundle = z.infer<typeof dataBundleSchema>;
