import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import { Actor, ActorInput, CapabilityActorInput } from './actor.model';
import { ActorsService } from './actors.service';

@Resolver(() => Actor)
export class ActorsResolver {
  constructor(private readonly service: ActorsService) {}

  @Query(() => [Actor])
  actors(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
  ): Promise<Actor[]> {
    return this.service.findAll(principal, enterpriseId);
  }

  @Query(() => Actor, { nullable: true })
  actor(@CurrentUser() principal: Principal, @Args('id') id: string): Promise<Actor | undefined> {
    return this.service.findOne(principal, id);
  }

  @Mutation(() => Actor)
  createActor(
    @CurrentUser() principal: Principal,
    @Args('input') input: ActorInput,
  ): Promise<Actor> {
    return this.service.create(principal, input);
  }

  @Mutation(() => Actor)
  updateActor(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
    @Args('input') input: ActorInput,
  ): Promise<Actor> {
    return this.service.update(principal, id, input);
  }

  @Mutation(() => Boolean)
  deleteActor(@CurrentUser() principal: Principal, @Args('id') id: string): Promise<boolean> {
    return this.service.delete(principal, id);
  }

  @Mutation(() => Actor)
  linkCapabilityActor(
    @CurrentUser() principal: Principal,
    @Args('input') input: CapabilityActorInput,
  ): Promise<Actor> {
    return this.service.link(principal, input);
  }

  @Mutation(() => Boolean)
  unlinkCapabilityActor(
    @CurrentUser() principal: Principal,
    @Args('linkId') linkId: string,
  ): Promise<boolean> {
    return this.service.unlink(principal, linkId);
  }
}
