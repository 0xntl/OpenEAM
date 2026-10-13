import { Args, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import { ArchitectureDomain } from './architecture-domain.model';
import { ArchitectureDomainsService } from './architecture-domains.service';

@Resolver(() => ArchitectureDomain)
export class ArchitectureDomainsResolver {
  constructor(private readonly service: ArchitectureDomainsService) {}

  @Query(() => [ArchitectureDomain])
  architectureDomains(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
  ) {
    return this.service.findAll(principal, enterpriseId);
  }

  @Query(() => ArchitectureDomain, { nullable: true })
  architectureDomain(@CurrentUser() principal: Principal, @Args('id') id: string) {
    return this.service.findOne(principal, id);
  }
}
