import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { Delivery, DeliverySchema } from '../delivery/schemas/delivery.schema';
import { DriverManagementController } from './driver-management.controller';
import { DriverManagementService } from './driver-management.service';

@Module({
  imports: [
    AuthModule,
    UserModule,
    MongooseModule.forFeature([{ name: Delivery.name, schema: DeliverySchema }]),
  ],
  controllers: [DriverManagementController],
  providers: [DriverManagementService],
})
export class DriverManagementModule {}
