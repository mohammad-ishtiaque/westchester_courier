import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { DriverManagementController } from './driver-management.controller';
import { DriverManagementService } from './driver-management.service';

@Module({
  imports: [AuthModule, UserModule],
  controllers: [DriverManagementController],
  providers: [DriverManagementService],
})
export class DriverManagementModule {}
