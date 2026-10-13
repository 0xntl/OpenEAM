import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators';
import { InstanceRole } from '../auth/auth.model';
import { AuthService } from '../auth/auth.service';
import type { Principal } from '../auth/principal';
import {
  AdminUser,
  CreateUserInput,
  InstanceSettings,
  InstanceSettingsInput,
  SetupLink,
} from './admin.model';
import { AdminService } from './admin.service';

// Every field here is instance-admin only (D-17).
@AdminOnly()
@Resolver()
export class AdminResolver {
  constructor(
    private readonly service: AdminService,
    private readonly auth: AuthService,
  ) {}

  @Query(() => [AdminUser], { description: 'Every account on the instance. Admin only.' })
  users(): Promise<AdminUser[]> {
    return this.service.users();
  }

  @Query(() => InstanceSettings, { description: 'Admin only.' })
  instanceSettings(): Promise<InstanceSettings> {
    return this.auth.instanceSettings();
  }

  @Mutation(() => InstanceSettings)
  updateInstanceSettings(@Args('input') input: InstanceSettingsInput): Promise<InstanceSettings> {
    return this.service.updateSettings(input);
  }

  @Mutation(() => SetupLink, {
    description: 'Creates an account without a password and returns its one-time setup link.',
  })
  createUser(
    @CurrentUser() principal: Principal,
    @Args('input') input: CreateUserInput,
  ): Promise<SetupLink> {
    return this.service.createUser(principal, input);
  }

  @Mutation(() => SetupLink, {
    description:
      'Issues a new one-time link through which the person sets a password; earlier links stop working.',
  })
  createPasswordSetupLink(
    @CurrentUser() principal: Principal,
    @Args('userId') userId: string,
  ): Promise<SetupLink> {
    return this.service.createSetupLink(principal, userId);
  }

  @Mutation(() => AdminUser)
  setUserRole(
    @Args('userId') userId: string,
    @Args('role', { type: () => InstanceRole }) role: InstanceRole,
  ): Promise<AdminUser> {
    return this.service.setRole(userId, role);
  }

  @Mutation(() => AdminUser)
  setUserDisabled(
    @CurrentUser() principal: Principal,
    @Args('userId') userId: string,
    @Args('disabled') disabled: boolean,
  ): Promise<AdminUser> {
    return this.service.setDisabled(principal, userId, disabled);
  }

  @Mutation(() => Boolean)
  deleteUser(
    @CurrentUser() principal: Principal,
    @Args('userId') userId: string,
  ): Promise<boolean> {
    return this.service.deleteUser(principal, userId);
  }
}
