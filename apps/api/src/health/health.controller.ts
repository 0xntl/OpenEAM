// REST GET /health endpoint for Docker / load-balancer probes. Returns 200 when
// healthy and 503 when the database is unreachable, so orchestrators can react.
import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { HealthService, type HealthStatus } from './health.service';

// Probes run without a session.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(200)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const status = await this.healthService.check();
    if (status.status !== 'ok') {
      res.status(503);
    }
    return status;
  }
}
