import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import {
  ArchitectureBuildingBlock,
  ArchitectureLevel,
  BuildingBlock,
  BuildingBlockInput,
  BuildingBlockRelationship,
  BuildingBlockRelationshipInput,
  SolutionBuildingBlock,
} from './building-block.model';
import { BuildingBlocksService } from './building-blocks.service';

@Resolver(() => BuildingBlock)
export class BuildingBlocksResolver {
  constructor(private readonly service: BuildingBlocksService) {}

  @Query(() => [BuildingBlock])
  buildingBlocks(@CurrentUser() principal: Principal, @Args('enterpriseId') enterpriseId: string) {
    return this.service.findAll(principal, enterpriseId);
  }

  @Query(() => BuildingBlock, { nullable: true })
  buildingBlock(@CurrentUser() principal: Principal, @Args('id') id: string) {
    return this.service.findOne(principal, id);
  }

  // The Architecture Landscape: all ABBs visible from the chosen viewpoint
  // (time, depth, domain, breadth). All filters are optional.
  @Query(() => [ArchitectureBuildingBlock])
  architectureLandscape(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
    @Args('asOf', { nullable: true, description: 'ISO date (YYYY-MM-DD)' }) asOf?: string,
    @Args('architectureLevel', { type: () => ArchitectureLevel, nullable: true })
    architectureLevel?: ArchitectureLevel,
    @Args('architectureDomainId', { nullable: true }) architectureDomainId?: string,
    @Args('organizationUnitId', { nullable: true }) organizationUnitId?: string,
  ) {
    return this.service.architectureLandscape(principal, {
      enterpriseId,
      asOf,
      architectureLevel,
      architectureDomainId,
      organizationUnitId,
    });
  }

  // The Solutions Landscape: all SBBs visible from the chosen viewpoint.
  @Query(() => [SolutionBuildingBlock])
  solutionsLandscape(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
    @Args('asOf', { nullable: true, description: 'ISO date (YYYY-MM-DD)' }) asOf?: string,
    @Args('architectureDomainId', { nullable: true }) architectureDomainId?: string,
    @Args('organizationUnitId', { nullable: true }) organizationUnitId?: string,
  ) {
    return this.service.solutionsLandscape(principal, {
      enterpriseId,
      asOf,
      architectureDomainId,
      organizationUnitId,
    });
  }

  @Mutation(() => BuildingBlock)
  createBuildingBlock(
    @CurrentUser() principal: Principal,
    @Args('input') input: BuildingBlockInput,
  ) {
    return this.service.create(principal, input);
  }

  @Mutation(() => BuildingBlock)
  updateBuildingBlock(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
    @Args('input') input: BuildingBlockInput,
  ) {
    return this.service.update(principal, id, input);
  }

  @Mutation(() => Boolean)
  deleteBuildingBlock(@CurrentUser() principal: Principal, @Args('id') id: string) {
    return this.service.delete(principal, id);
  }

  @Mutation(() => BuildingBlockRelationship)
  createBuildingBlockRelationship(
    @CurrentUser() principal: Principal,
    @Args('input') input: BuildingBlockRelationshipInput,
  ) {
    return this.service.createRelationship(principal, input);
  }

  @Mutation(() => Boolean)
  deleteBuildingBlockRelationship(@CurrentUser() principal: Principal, @Args('id') id: string) {
    return this.service.deleteRelationship(principal, id);
  }
}
