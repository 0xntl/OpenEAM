import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import { ValueStream, ValueStreamInput } from './value-stream.model';
import { ValueStreamsService } from './value-streams.service';

@Resolver(() => ValueStream)
export class ValueStreamsResolver {
  constructor(private readonly service: ValueStreamsService) {}

  @Query(() => [ValueStream])
  valueStreams(@CurrentUser() principal: Principal, @Args('enterpriseId') enterpriseId: string) {
    return this.service.findAll(principal, enterpriseId);
  }

  @Query(() => ValueStream, { nullable: true })
  valueStream(@CurrentUser() principal: Principal, @Args('id') id: string) {
    return this.service.findOne(principal, id);
  }

  @Mutation(() => ValueStream)
  createValueStream(@CurrentUser() principal: Principal, @Args('input') input: ValueStreamInput) {
    return this.service.create(principal, input);
  }

  @Mutation(() => ValueStream)
  updateValueStream(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
    @Args('input') input: ValueStreamInput,
  ) {
    return this.service.update(principal, id, input);
  }

  @Mutation(() => Boolean)
  deleteValueStream(@CurrentUser() principal: Principal, @Args('id') id: string) {
    return this.service.delete(principal, id);
  }
}
