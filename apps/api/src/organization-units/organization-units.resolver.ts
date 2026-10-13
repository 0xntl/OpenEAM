import { Args, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import { OrganizationUnit } from './organization-unit.model';
import { OrganizationUnitsService } from './organization-units.service';

@Resolver(() => OrganizationUnit)
export class OrganizationUnitsResolver {
  constructor(private readonly service: OrganizationUnitsService) {}

  @Query(() => [OrganizationUnit])
  organizationUnits(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
  ) {
    return this.service.findAll(principal, enterpriseId);
  }

  @Query(() => OrganizationUnit, { nullable: true })
  organizationUnit(@CurrentUser() principal: Principal, @Args('id') id: string) {
    return this.service.findOne(principal, id);
  }
}
