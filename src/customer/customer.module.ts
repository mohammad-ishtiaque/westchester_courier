import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  imports: [DeliveryModule],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
