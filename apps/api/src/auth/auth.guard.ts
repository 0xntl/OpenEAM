// Global guard: resolves the session on every request and attaches the
// Principal to the request, then rejects anything not marked @Public when
// there is no session. Resolving before the public check lets @Public
// handlers such as `me` see who is asking.
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ONLY, IS_PUBLIC, requestOf } from './auth.decorators';
import { AuthService } from './auth.service';
import { tokenFromRequest } from './session-cookie';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { req } = requestOf(context);

    // A GraphQL document with several top-level fields runs the guard once
    // per field; resolve the session only the first time.
    if (req.principal === undefined) {
      const token = tokenFromRequest(req);
      req.principal = token ? await this.auth.resolveSession(token) : null;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (!req.principal) throw new UnauthorizedException('Sign in required');

    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (adminOnly && req.principal.instanceRole !== 'admin') {
      throw new ForbiddenException('Only an instance admin can do this');
    }
    return true;
  }
}
