import { z } from 'zod';
import { ICON_ID_MESSAGE, isIconId } from '../icons/icon-id';
import { CURRENT_FORMAT_VERSION } from './data-bundle.format';

// The shape of a bundle in the current format version. A bundle is migrated
// to this version before it is validated (data-bundle.format.ts, D-24), so
// this schema never has to know about older shapes.
//
// Omitted means null, default, or empty: a field marked optional here may be
// left out by a hand-written bundle, or by one exported before the field
// existed, and reads as the value the database would fill in. That is the
// format's rule, not a per-field accident, so adding an optional field is not
// a new format version.

// Every id is a UUID (D-8, D-18): the columns are `uuid`, so the schema says
// so too and a malformed id is a 400 with a path, not a database error.

// Record timestamps: exported for round-trip fidelity; omitted, the database
// fills them in.
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
  // The collection must be one this instance serves; the name is not checked
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
  // Which format this bundle is written in. Import migrates older bundles
  // to the current version first; one written by a newer OpenEAM is refused.
  formatVersion: z.literal(CURRENT_FORMAT_VERSION),
  // Provenance, written by export and ignored by import: when, and by which
  // software. Hand-written bundles leave them out.
  exportedAt: z.string().optional(),
  generator: z.object({ name: z.string(), version: z.string() }).optional(),
  // The enterprises this bundle carries; import replaces exactly these
  // enterprises' models and touches nothing else.
  enterprises: z.array(enterpriseSchema),
  businessCapabilities: z.array(businessCapabilitySchema).default([]),
  businessProcesses: z.array(businessProcessSchema).default([]),
  processSteps: z.array(processStepSchema).default([]),
  valueStreams: z.array(valueStreamSchema).default([]),
  valueStreamStages: z.array(valueStreamStageSchema).default([]),
  stageCapabilities: z.array(stageCapabilitySchema).default([]),
  architectureDomains: z.array(architectureDomainSchema).default([]),
  organizationUnits: z.array(organizationUnitSchema).default([]),
  buildingBlocks: z.array(buildingBlockSchema).default([]),
  buildingBlockArchitectureDomains: z.array(buildingBlockArchitectureDomainSchema).default([]),
  buildingBlockOrganizationUnits: z.array(buildingBlockOrganizationUnitSchema).default([]),
  buildingBlockRealizations: z.array(buildingBlockRealizationSchema).default([]),
  buildingBlockCapabilities: z.array(buildingBlockCapabilitySchema).default([]),
  buildingBlockRelationships: z.array(buildingBlockRelationshipSchema).default([]),
  informationObjects: z.array(informationObjectSchema).default([]),
  capabilityInformation: z.array(capabilityInformationSchema).default([]),
  actors: z.array(actorSchema).default([]),
  capabilityActors: z.array(capabilityActorSchema).default([]),
});

export type DataBundle = z.infer<typeof dataBundleSchema>;
