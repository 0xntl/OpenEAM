// Rejects state-changing requests whose Origin header is neither the web
// origin nor the API's own host. SameSite=Lax already keeps the session
// cookie off cross-site POSTs; this is the second, independent check OWASP
// recommends, and it also covers browsers that do not honour SameSite.
// Requests without an Origin header (curl, server-side scripts) pass: a
// browser cannot omit it on a cross-site POST.
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function rejectForeignOrigins(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (SAFE_METHODS.has(req.method) || !origin) {
    next();
    return;
  }

  const allowed = new Set([config.WEB_ORIGIN]);
  // Same-origin through a proxy such as the Compose nginx: Origin is the
  // public origin, Host is whatever the proxy forwarded.
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? req.protocol;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  if (host) allowed.add(`${proto}://${host}`);

  if (!allowed.has(origin)) {
    res.status(403).json({ statusCode: 403, message: 'Request origin not allowed' });
    return;
  }
  next();
}
