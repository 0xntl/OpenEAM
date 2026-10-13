import { Field, InputType, InterfaceType, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum BuildingBlockKind {
  ARCHITECTURE = 'architecture',
  SOLUTION = 'solution',
}

registerEnumType(BuildingBlockKind, {
  name: 'BuildingBlockKind',
  description: 'Whether a building block is an ABB (architecture) or SBB (solution).',
});

export enum ArchitectureLevel {
  STRATEGIC = 'strategic',
  SEGMENT = 'segment',
  CAPABILITY = 'capability',
}

registerEnumType(ArchitectureLevel, {
  name: 'ArchitectureLevel',
  description:
    'TOGAF level of detail ("depth") of an architecture building block in the Architecture Landscape.',
});

export enum LifecyclePhase {
  PLANNED = 'planned',
  ACTIVE = 'active',
  PHASING_OUT = 'phasing_out',
  RETIRED = 'retired',
}

registerEnumType(LifecyclePhase, { name: 'LifecyclePhase' });

export enum BuildingBlockRelationshipType {
  DEPENDS_ON = 'depends_on',
  DATA_FLOW = 'data_flow',
  HOSTED_ON = 'hosted_on',
}

registerEnumType(BuildingBlockRelationshipType, {
  name: 'BuildingBlockRelationshipType',
  description:
    'How a building block relates to another: depends_on (needs it to function), data_flow (exchanges data with it), or hosted_on (runs on it — containment, not a peer relationship; a block should have at most one active hosted_on edge at a time).',
});

// Temporal links carry a validity interval (ISO dates, null = unbounded) so
// the landscape can be reconstructed for any point on the timeline.
@ObjectType()
export class OrganizationUnitLink {
  @Field() organizationUnitId!: string;
  @Field(() => String, { nullable: true }) validFrom?: string | null;
  @Field(() => String, { nullable: true }) validTo?: string | null;
}

@ObjectType()
export class CapabilityLink {
  @Field() capabilityId!: string;
  @Field(() => String, { nullable: true }) validFrom?: string | null;
  @Field(() => String, { nullable: true }) validTo?: string | null;
}

@ObjectType()
export class RealizationLink {
  @Field() architectureBuildingBlockId!: string;
  @Field() solutionBuildingBlockId!: string;
  @Field(() => String, { nullable: true }) validFrom?: string | null;
  @Field(() => String, { nullable: true }) validTo?: string | null;
}

// A free-standing graph edge between two building blocks (either kind),
// independent of realization/capability/domain assignment — the source of
// truth for the diagram view, which lays these out rather than storing
// hand-placed shapes.
@ObjectType()
export class BuildingBlockRelationship {
  @Field() id!: string;
  @Field() sourceBuildingBlockId!: string;
  @Field() targetBuildingBlockId!: string;
  @Field(() => BuildingBlockRelationshipType) type!: BuildingBlockRelationshipType;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) validFrom?: string | null;
  @Field(() => String, { nullable: true }) validTo?: string | null;
}

@InterfaceType({
  resolveType: (value: { kind: 'architecture' | 'solution' }) =>
    value.kind === 'architecture' ? ArchitectureBuildingBlock : SolutionBuildingBlock,
})
export abstract class BuildingBlock {
  @Field() id!: string;
  @Field() enterpriseId!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  // An Iconify id such as "simple-icons:postgresql" or "lucide:database",
  // drawn from the collections GET /api/icons serves (D-22).
  @Field(() => String, { nullable: true }) icon?: string | null;
  @Field(() => LifecyclePhase) lifecyclePhase!: LifecyclePhase;
  @Field(() => String, { nullable: true }) validFrom?: string | null;
  @Field(() => String, { nullable: true }) validTo?: string | null;
  @Field(() => [String]) architectureDomainIds!: string[];
  @Field(() => [OrganizationUnitLink]) organizationUnitLinks!: OrganizationUnitLink[];
  @Field(() => [BuildingBlockRelationship]) outgoingRelationships!: BuildingBlockRelationship[];
  @Field(() => [BuildingBlockRelationship]) incomingRelationships!: BuildingBlockRelationship[];
}

@ObjectType({ implements: () => [BuildingBlock] })
export class ArchitectureBuildingBlock extends BuildingBlock {
  @Field(() => ArchitectureLevel, { nullable: true })
  architectureLevel?: ArchitectureLevel | null;
  @Field(() => [CapabilityLink]) capabilityLinks!: CapabilityLink[];
  @Field(() => [RealizationLink]) realizedBy!: RealizationLink[];
}

@ObjectType({ implements: () => [BuildingBlock] })
export class SolutionBuildingBlock extends BuildingBlock {
  @Field(() => [RealizationLink]) realizes!: RealizationLink[];
}

// Create/update input. Organization unit and domain assignment are managed
// here as a replace-all set (no validity interval) — enough for a basic CRUD
// form. Bundles imported via data-exchange remain the way to set up dated
// history.
@InputType()
export class BuildingBlockInput {
  @Field() enterpriseId!: string;
  @Field(() => BuildingBlockKind) kind!: BuildingBlockKind;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) icon?: string | null;
  @Field(() => ArchitectureLevel, { nullable: true }) architectureLevel?: ArchitectureLevel | null;
  @Field(() => LifecyclePhase) lifecyclePhase!: LifecyclePhase;
  @Field(() => String, { nullable: true }) validFrom?: string | null;
  @Field(() => String, { nullable: true }) validTo?: string | null;
  @Field(() => [String]) architectureDomainIds!: string[];
  @Field(() => [String]) organizationUnitIds!: string[];
}

@InputType()
export class BuildingBlockRelationshipInput {
  @Field() sourceBuildingBlockId!: string;
  @Field() targetBuildingBlockId!: string;
  @Field(() => BuildingBlockRelationshipType) type!: BuildingBlockRelationshipType;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) validFrom?: string | null;
  @Field(() => String, { nullable: true }) validTo?: string | null;
}
