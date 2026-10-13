import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import type { BusinessCapabilityRow } from './business-capabilities.service';
import { BusinessCapabilitiesService } from './business-capabilities.service';
import { BusinessCapability, BusinessCapabilityInput } from './business-capability.model';

@Resolver(() => BusinessCapability)
export class BusinessCapabilitiesResolver {
  constructor(private readonly service: BusinessCapabilitiesService) {}

  @Query(() => [BusinessCapability])
  businessCapabilities(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
  ): Promise<BusinessCapabilityRow[]> {
    return this.service.findAll(principal, enterpriseId);
  }

  @Query(() => BusinessCapability, { nullable: true })
  businessCapability(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
  ): Promise<BusinessCapabilityRow | undefined> {
    return this.service.findOne(principal, id);
  }

  @Mutation(() => BusinessCapability)
  createBusinessCapability(
    @CurrentUser() principal: Principal,
    @Args('input') input: BusinessCapabilityInput,
  ): Promise<BusinessCapabilityRow> {
    return this.service.create(principal, input);
  }

  @Mutation(() => BusinessCapability)
  updateBusinessCapability(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
    @Args('input') input: BusinessCapabilityInput,
  ): Promise<BusinessCapabilityRow> {
    return this.service.update(principal, id, input);
  }

  @Mutation(() => Boolean)
  deleteBusinessCapability(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
  ): Promise<boolean> {
    return this.service.delete(principal, id);
  }
}
