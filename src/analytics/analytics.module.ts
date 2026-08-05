import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module';
import { UserModule } from '../user/user.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

import { ReportModule } from '../report/report.module';

@Module({
  imports: [DeliveryModule, UserModule, VehicleModule, ReportModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
