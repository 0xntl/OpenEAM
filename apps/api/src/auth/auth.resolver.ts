import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from './auth.decorators';
import {
  AuthPayload,
  AuthStatus,
  ChangePasswordInput,
  CompletePasswordSetupInput,
  SetupTokenStatus,
  SignInInput,
  SignUpInput,
  User,
} from './auth.model';
import { AuthService } from './auth.service';
import { GqlThrottlerGuard } from './gql-throttler.guard';
import type { Principal } from './principal';
import { clearSessionCookie, setSessionCookie, tokenFromRequest } from './session-cookie';

type GqlContext = { req: Request; res: Response };

@Resolver()
export class AuthResolver {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Query(() => AuthStatus)
  authStatus(): Promise<AuthStatus> {
    return this.service.status();
  }

  @Public()
  @Query(() => User, { nullable: true, description: 'The signed-in user, or null.' })
  me(@CurrentUser() principal: Principal | null): User | null {
    if (!principal) return null;
    return {
      id: principal.userId,
      email: principal.email,
      displayName: principal.displayName,
      instanceRole: principal.instanceRole as User['instanceRole'],
    };
  }

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Mutation(() => AuthPayload)
  async signUp(
    @Args('input') input: SignUpInput,
    @Context() ctx: GqlContext,
  ): Promise<AuthPayload> {
    const { user, session } = await this.service.signUp(input);
    setSessionCookie(ctx.res, session.token, session.expiresAt);
    return { user, token: session.token, expiresAt: session.expiresAt };
  }

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Mutation(() => AuthPayload)
  async signIn(
    @Args('input') input: SignInInput,
    @Context() ctx: GqlContext,
  ): Promise<AuthPayload> {
    const { user, session } = await this.service.signIn(input);
    setSessionCookie(ctx.res, session.token, session.expiresAt);
    return { user, token: session.token, expiresAt: session.expiresAt };
  }

  @Public()
  @Query(() => SetupTokenStatus, { description: 'Whether a setup link is usable, and for whom.' })
  setupTokenStatus(@Args('token') token: string): Promise<SetupTokenStatus> {
    return this.service.setupTokenStatus(token) as Promise<SetupTokenStatus>;
  }

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Mutation(() => AuthPayload, {
    description: 'Sets the password behind a setup link, ends other sessions, and signs in.',
  })
  async completePasswordSetup(
    @Args('input') input: CompletePasswordSetupInput,
    @Context() ctx: GqlContext,
  ): Promise<AuthPayload> {
    const { user, session } = await this.service.completeSetup(input.token, input.password);
    setSessionCookie(ctx.res, session.token, session.expiresAt);
    return { user, token: session.token, expiresAt: session.expiresAt };
  }

  @Mutation(() => Boolean, {
    description: 'Changes the own password and signs out every other session.',
  })
  async changePassword(
    @CurrentUser() principal: Principal,
    @Args('input') input: ChangePasswordInput,
    @Context() ctx: GqlContext,
  ): Promise<boolean> {
    await this.service.changePassword(principal, input, tokenFromRequest(ctx.req) ?? '');
    return true;
  }

  @Mutation(() => Boolean)
  async signOut(@Context() ctx: GqlContext): Promise<boolean> {
    const token = tokenFromRequest(ctx.req);
    if (token) await this.service.signOut(token);
    clearSessionCookie(ctx.res);
    return true;
  }
}
