import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import {
  CapabilityInformationInput,
  InformationObject,
  InformationObjectInput,
} from './information-object.model';
import { InformationObjectsService } from './information-objects.service';

@Resolver(() => InformationObject)
export class InformationObjectsResolver {
  constructor(private readonly service: InformationObjectsService) {}

  @Query(() => [InformationObject])
  informationObjects(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
  ): Promise<InformationObject[]> {
    return this.service.findAll(principal, enterpriseId);
  }

  @Query(() => InformationObject, { nullable: true })
  informationObject(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
  ): Promise<InformationObject | undefined> {
    return this.service.findOne(principal, id);
  }

  @Mutation(() => InformationObject)
  createInformationObject(
    @CurrentUser() principal: Principal,
    @Args('input') input: InformationObjectInput,
  ): Promise<InformationObject> {
    return this.service.create(principal, input);
  }

  @Mutation(() => InformationObject)
  updateInformationObject(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
    @Args('input') input: InformationObjectInput,
  ): Promise<InformationObject> {
    return this.service.update(principal, id, input);
  }

  @Mutation(() => Boolean)
  deleteInformationObject(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
  ): Promise<boolean> {
    return this.service.delete(principal, id);
  }

  @Mutation(() => InformationObject)
  linkCapabilityInformation(
    @CurrentUser() principal: Principal,
    @Args('input') input: CapabilityInformationInput,
  ): Promise<InformationObject> {
    return this.service.link(principal, input);
  }

  @Mutation(() => Boolean)
  unlinkCapabilityInformation(
    @CurrentUser() principal: Principal,
    @Args('linkId') linkId: string,
  ): Promise<boolean> {
    return this.service.unlink(principal, linkId);
  }
}
