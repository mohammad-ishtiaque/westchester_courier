import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { Report, ReportSchema } from './schemas/report.schema';
import { Delivery, DeliverySchema } from '../delivery/schemas/delivery.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: Delivery.name, schema: DeliverySchema },
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [MongooseModule],
})
export class ReportModule {}
