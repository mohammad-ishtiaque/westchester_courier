import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Delivery, DeliverySchema } from './schemas/delivery.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Delivery.name, schema: DeliverySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [MongooseModule],
})
export class DeliveryModule {}

