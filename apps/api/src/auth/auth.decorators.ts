import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request, Response } from 'express';

export const IS_PUBLIC = 'isPublic';
export const ADMIN_ONLY = 'adminOnly';

// Marks a resolver or controller handler as reachable without a session.
// Everything else is protected by the global AuthGuard.
export const Public = () => SetMetadata(IS_PUBLIC, true);

// Marks a handler (or a whole resolver) as instance-admin only.
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

// Works for both transports: GraphQL resolvers get req/res from the Apollo
// context (see app.module.ts), REST controllers from the HTTP adapter.
export function requestOf(context: ExecutionContext): { req: Request; res: Response } {
  if (context.getType<'graphql' | 'http'>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext<{ req: Request; res: Response }>();
  }
  const http = context.switchToHttp();
  return { req: http.getRequest<Request>(), res: http.getResponse<Response>() };
}

// Injects the Principal resolved by AuthGuard. Null only on @Public handlers.
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return requestOf(context).req.principal ?? null;
});
