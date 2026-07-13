import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Delivery, DeliverySchema } from './schemas/delivery.schema';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Delivery.name, schema: DeliverySchema }])],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [MongooseModule],
})
export class DeliveryModule {}
