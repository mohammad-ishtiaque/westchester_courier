import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vehicle, VehicleSchema } from './schemas/vehicle.schema';
import { VehicleController } from './vehicle.controller';
import { VehicleService } from './vehicle.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Vehicle.name, schema: VehicleSchema }]), UserModule],
  controllers: [VehicleController],
  providers: [VehicleService],
  exports: [MongooseModule],
})
export class VehicleModule {}
