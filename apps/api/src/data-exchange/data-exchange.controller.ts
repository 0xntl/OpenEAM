import { Body, Controller, Get, HttpException, HttpStatus, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import type { Principal } from '../auth/principal';
import { dataBundleSchema } from './data-bundle.schema';
import { DataExchangeService } from './data-exchange.service';

// Namespaced under /api to avoid colliding with the web SPA's /data-exchange
// route. Behind the same session guard as GraphQL; scripts pass the token
// from signIn as `Authorization: Bearer …` (see README).
@Controller('api/data-exchange')
export class DataExchangeController {
  constructor(private readonly service: DataExchangeService) {}

  // ?enterpriseId=... exports a single enterprise; omitted, every enterprise
  // the caller is a member of.
  @Get('export')
  export(@CurrentUser() principal: Principal, @Query('enterpriseId') enterpriseId?: string) {
    return this.service.export(principal, enterpriseId || undefined);
  }

  @Post('import')
  async import(@CurrentUser() principal: Principal, @Body() body: unknown) {
    const result = dataBundleSchema.safeParse(body);
    if (!result.success) {
      throw new HttpException(
        { message: 'Invalid data bundle', issues: result.error.issues },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.service.import(principal, result.data);
    return { ok: true };
  }
}
