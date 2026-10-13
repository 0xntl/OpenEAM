// The session token travels in an httpOnly cookie for the browser, or in an
// Authorization: Bearer header for scripts (the curl examples in the README).
// Only the token's hash is stored server-side; see AuthService.
import type { Request, Response } from 'express';
import { config } from '../config';

export const SESSION_COOKIE = 'openeam_session';

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export function tokenFromRequest(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token) return token;
  }
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? null;
}

export function setSessionCookie(res: Response, token: string, expiresAt: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // Lax keeps the cookie off cross-site POSTs (CSRF) while still sending it
    // on top-level navigations to the app.
    sameSite: 'lax',
    secure: config.AUTH_COOKIE_SECURE,
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.AUTH_COOKIE_SECURE,
    path: '/',
  });
}
