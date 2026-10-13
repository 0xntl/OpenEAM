export interface NamedRef {
  id: string;
  name: string;
}

export interface ProcessStep {
  id: string;
  name: string;
}

export interface BusinessProcess {
  id: string;
  enterpriseId: string;
  name: string;
  description?: string | null;
  capabilityId: string;
  triggerEvent?: string | null;
  outcome?: string | null;
  bpmnXml?: string | null;
  steps: ProcessStep[];
}

export interface CapabilityResource {
  id: string;
  name: string;
  lifecyclePhase: LifecyclePhase;
  __typename: 'ArchitectureBuildingBlock' | 'SolutionBuildingBlock';
}

export interface ValueStreamStageLink {
  valueStreamId: string;
  valueStreamName: string;
  stageId: string;
  stageName: string;
}

export interface BusinessCapabilityDetail {
  id: string;
  enterpriseId: string;
  name: string;
  description?: string | null;
  direction?: CapabilityDirection | null;
  actors: CapabilityActor[];
  resources: CapabilityResource[];
  information: CapabilityInformation[];
  businessProcesses: NamedRef[];
  valueStreamStages: ValueStreamStageLink[];
}

export type ActorKind = 'ROLE' | 'TEAM' | 'INDIVIDUAL' | 'EXTERNAL';
export type ActorInvolvement = 'ACCOUNTABLE' | 'PERFORMS' | 'CONSULTED';
export type InformationUsage = 'OWNS' | 'CREATES' | 'USES';

// One actor involved in a capability. The UI card is titled "People" because
// that is the classic capability dimension; the entity is an actor, because
// accountability usually sits with a role or a team rather than a person.
export interface CapabilityActor extends NamedRef {
  kind: ActorKind;
  involvement: ActorInvolvement;
}

// One information object as seen from a capability: what it is, and how the
// capability relates to it.
export interface CapabilityInformation extends NamedRef {
  usage: InformationUsage;
}

export interface BusinessCapabilitySummary {
  id: string;
  name: string;
  description?: string | null;
  direction?: CapabilityDirection | null;
  businessProcesses: { id: string }[];
  resources: { id: string }[];
  valueStreamStages: ValueStreamStageLink[];
}

export interface ValueStreamCapability {
  id: string;
  name: string;
  description?: string | null;
}

export interface ValueStreamStage {
  id: string;
  name: string;
  capabilityIds: string[];
}

export interface ValueStream {
  id: string;
  name: string;
  description?: string | null;
  stages: ValueStreamStage[];
}

export type BuildingBlockKind = 'ARCHITECTURE' | 'SOLUTION';
export type ArchitectureLevel = 'STRATEGIC' | 'SEGMENT' | 'CAPABILITY';
export type LifecyclePhase = 'PLANNED' | 'ACTIVE' | 'PHASING_OUT' | 'RETIRED';
export type CapabilityDirection = 'INVEST' | 'SUSTAIN' | 'COMMODITY' | 'SUNSET';

export interface OrganizationUnitLink {
  organizationUnitId: string;
  validFrom?: string | null;
  validTo?: string | null;
}

export type BuildingBlockRelationshipType = 'DEPENDS_ON' | 'DATA_FLOW' | 'HOSTED_ON';

export interface BuildingBlockRelationship {
  id: string;
  sourceBuildingBlockId: string;
  targetBuildingBlockId: string;
  type: BuildingBlockRelationshipType;
  description?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface BuildingBlock {
  id: string;
  name: string;
  description?: string | null;
  // Iconify id ("simple-icons:postgresql", "lucide:database") or null; see lib/icons.ts.
  icon?: string | null;
  lifecyclePhase: LifecyclePhase;
  validFrom?: string | null;
  validTo?: string | null;
  architectureDomainIds: string[];
  organizationUnitLinks: OrganizationUnitLink[];
  __typename: 'ArchitectureBuildingBlock' | 'SolutionBuildingBlock';
  architectureLevel?: ArchitectureLevel | null;
}

export interface ArchitectureDomain {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface OrganizationUnit {
  id: string;
  name: string;
  parentId?: string | null;
}

// --- Actors and information objects, as their own pages see them ---------

export interface ActorCapabilityLink {
  linkId: string;
  capabilityId: string;
  capabilityName: string;
  involvement: ActorInvolvement;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface ActorSummary {
  id: string;
  name: string;
  description?: string | null;
  kind: ActorKind;
  organizationUnitId?: string | null;
  organizationUnitName?: string | null;
  capabilities: ActorCapabilityLink[];
}

export interface ActorDetail extends ActorSummary {
  enterpriseId: string;
}

export interface InformationCapabilityLink {
  linkId: string;
  capabilityId: string;
  capabilityName: string;
  usage: InformationUsage;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface InformationObjectSummary {
  id: string;
  name: string;
  description?: string | null;
  capabilities: InformationCapabilityLink[];
}

export interface InformationObjectDetail extends InformationObjectSummary {
  enterpriseId: string;
}
