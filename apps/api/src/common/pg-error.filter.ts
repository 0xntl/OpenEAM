// Turns the database errors a client can cause into the status they deserve.
// Services and the bundle validator catch these first; the constraints are the
// last line (D-18), and when one fires it should read as the client's mistake,
// not as a crash. Everything else stays a 500.
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  type ExceptionFilter,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlArgumentsHost } from '@nestjs/graphql';

interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

const MESSAGES: Record<string, (e: PgError) => Error> = {
  // invalid_text_representation — a non-UUID where an id is expected.
  '22P02': () => new BadRequestException('Malformed id'),
  // unique_violation — includes the partial "one open link" indexes.
  '23505': (e) => new ConflictException(`Already exists: ${e.constraint ?? 'duplicate value'}`),
  // foreign_key_violation — referenced row missing or in another enterprise.
  '23503': (e) => new BadRequestException(`Reference not satisfied: ${e.constraint ?? 'unknown'}`),
  // check_violation — an invariant the schema declares.
  '23514': (e) => new BadRequestException(`Rule violated: ${e.constraint ?? 'unknown'}`),
};

// Drizzle wraps the driver error (DrizzleQueryError → cause); walk down to it.
export function translatePgError(error: unknown): Error | null {
  let current = error as PgError | undefined;
  for (let depth = 0; current && typeof current === 'object' && depth < 5; depth += 1) {
    const translate = current.code ? MESSAGES[current.code] : undefined;
    if (translate) return translate(current);
    current = (current as { cause?: PgError }).cause;
  }
  return null;
}

@Catch()
export class PgErrorFilter extends BaseExceptionFilter implements ExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    const translated = translatePgError(exception);
    if (host.getType<'graphql' | 'http'>() === 'graphql') {
      // GraphQL formats thrown errors itself; rethrow the translated one.
      GqlArgumentsHost.create(host);
      throw translated ?? exception;
    }
    super.catch(translated ?? exception, host);
  }
}
