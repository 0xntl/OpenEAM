// Environment configuration, validated once at import time so a bad
// production config fails at startup with a readable message rather than at
// the first request. Everything that reads process.env goes through here.
import { z } from 'zod';

const flag = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  // Public sign-up is closed by default: the first account can always be
  // created (an empty instance would otherwise be unusable), after that an
  // existing member adds people to an enterprise by email. Set to true for
  // an instance where anyone with the URL may create an account.
  AUTH_ALLOW_SIGNUP: flag,
  // Mark the session cookie Secure. Off by default so a self-hosted instance
  // reached over plain HTTP on a LAN still works; turn it on behind TLS.
  AUTH_COOKIE_SECURE: flag,
  // How many reverse proxies sit in front of the API. The client address —
  // which the sign-in rate limit keys on — is taken from X-Forwarded-For
  // exactly that many hops in; anything further is attacker-controlled. 0
  // (direct connections) ignores the header entirely; the Compose setup
  // sets 1 for its nginx.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

function load() {
  const result = envSchema.safeParse({
    ...process.env,
    // Platform-style PORT is accepted as a fallback for API_PORT.
    API_PORT: process.env.API_PORT ?? process.env.PORT,
  });
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const env = result.data;
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    // GraphiQL and introspection ship an interactive query IDE over the
    // model; they are development tools, not something a deployment exposes.
    graphiql: env.NODE_ENV !== 'production',
  };
}

export const config = load();
export type Config = typeof config;
