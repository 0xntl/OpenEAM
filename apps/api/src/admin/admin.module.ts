import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminResolver } from './admin.resolver';
import { AdminService } from './admin.service';
import { BrandingController } from './branding.controller';

@Module({
  imports: [AuthModule],
  controllers: [BrandingController],
  providers: [AdminService, AdminResolver],
})
export class AdminModule {}
