// @nestjs/throttler reads req/res from the HTTP adapter by default; for
// GraphQL resolvers they live in the Apollo context instead. Applied only to
// the sign-in and sign-up mutations, where it is brute-force protection.
import { type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { requestOf } from './auth.decorators';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(context: ExecutionContext) {
    return requestOf(context);
  }

  // The stock ThrottlerException carries a plain-string response, which the
  // Apollo driver does not recognise as an HTTP error; give it the shape it
  // expects so the client sees the message and a 429 status.
  protected override async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const seconds = Math.max(1, Math.ceil(detail.timeToBlockExpire));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many attempts — try again in ${seconds} seconds`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
