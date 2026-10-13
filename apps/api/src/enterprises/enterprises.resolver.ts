import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/auth.decorators';
import { permissionsOf } from '../auth/policy';
import type { Principal } from '../auth/principal';
import {
  AccountSummary,
  Enterprise,
  EnterpriseInput,
  EnterpriseMember,
  EnterpriseRole,
} from './enterprise.model';
import { EnterprisesService } from './enterprises.service';

@Resolver(() => Enterprise)
export class EnterprisesResolver {
  constructor(private readonly service: EnterprisesService) {}

  @Query(() => [Enterprise], { description: 'The enterprises the signed-in user is a member of.' })
  enterprises(@CurrentUser() principal: Principal): Promise<Enterprise[]> {
    return this.service.findAll(principal);
  }

  @Query(() => [AccountSummary], {
    description:
      'Active accounts on the instance, for owners choosing whom to add to an enterprise.',
  })
  accounts(@CurrentUser() principal: Principal): Promise<AccountSummary[]> {
    return this.service.accounts(principal);
  }

  @Query(() => Enterprise, { nullable: true })
  enterprise(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
  ): Promise<Enterprise | undefined> {
    return this.service.findOne(principal, id);
  }

  @ResolveField(() => EnterpriseRole, { nullable: true })
  myRole(@CurrentUser() principal: Principal, @Parent() enterprise: Enterprise) {
    return (principal.memberships[enterprise.id] as EnterpriseRole | undefined) ?? null;
  }

  @ResolveField(() => [String])
  myPermissions(@CurrentUser() principal: Principal, @Parent() enterprise: Enterprise): string[] {
    const role = principal.memberships[enterprise.id];
    return role ? [...permissionsOf(role)] : [];
  }

  @ResolveField(() => [EnterpriseMember])
  members(
    @CurrentUser() principal: Principal,
    @Parent() enterprise: Enterprise,
  ): Promise<EnterpriseMember[]> {
    return this.service.members(principal, enterprise.id);
  }

  @Mutation(() => Enterprise, {
    description: 'Creates an enterprise with the caller as its first member.',
  })
  createEnterprise(
    @CurrentUser() principal: Principal,
    @Args('input') input: EnterpriseInput,
  ): Promise<Enterprise> {
    return this.service.create(principal, input);
  }

  @Mutation(() => Enterprise)
  updateEnterprise(
    @CurrentUser() principal: Principal,
    @Args('id') id: string,
    @Args('input') input: EnterpriseInput,
  ): Promise<Enterprise> {
    return this.service.update(principal, id, input);
  }

  @Mutation(() => Boolean)
  deleteEnterprise(@CurrentUser() principal: Principal, @Args('id') id: string): Promise<boolean> {
    return this.service.delete(principal, id);
  }

  @Mutation(() => [EnterpriseMember], {
    description:
      'Gives an existing account access to an enterprise in a role (editor by default). Returns the member list.',
  })
  addEnterpriseMember(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
    @Args('email') email: string,
    @Args('role', { type: () => EnterpriseRole, nullable: true }) role?: EnterpriseRole | null,
  ): Promise<EnterpriseMember[]> {
    return this.service.addMember(principal, enterpriseId, email, role ?? EnterpriseRole.EDITOR);
  }

  @Mutation(() => [EnterpriseMember], { description: 'Returns the member list.' })
  setEnterpriseMemberRole(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
    @Args('userId') userId: string,
    @Args('role', { type: () => EnterpriseRole }) role: EnterpriseRole,
  ): Promise<EnterpriseMember[]> {
    return this.service.setMemberRole(principal, enterpriseId, userId, role);
  }

  @Mutation(() => [EnterpriseMember], { description: 'Returns the remaining member list.' })
  removeEnterpriseMember(
    @CurrentUser() principal: Principal,
    @Args('enterpriseId') enterpriseId: string,
    @Args('userId') userId: string,
  ): Promise<EnterpriseMember[]> {
    return this.service.removeMember(principal, enterpriseId, userId);
  }
}
