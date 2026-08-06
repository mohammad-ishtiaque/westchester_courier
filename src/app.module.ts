import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { DeliveryModule } from './delivery/delivery.module';
import { ProfileModule } from './profile/profile.module';
import { VehicleModule } from './vehicle/vehicle.module';
import { DriverManagementModule } from './driver-management/driver-management.module';
import { CustomerModule } from './customer/customer.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CmsModule } from './cms/cms.module';
import { SupportModule } from './support/support.module';
import { MailModule } from './common/mail/mail.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ReportModule } from './report/report.module';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URL'),
      }),
    }),
    // Powers the expired-OTP cleanup cron job (mirrors the template's node-cron job
    // in auth.service.ts) — registered here, the actual @Cron() job lives in AuthService.
    ScheduleModule.forRoot(),
    MailModule,
    AuthModule,
    UserModule,
    AdminModule,
    DeliveryModule,
    ProfileModule,
    VehicleModule,
    DriverManagementModule,
    CustomerModule,
    AnalyticsModule,
    CmsModule,
    SupportModule,
    ReportModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
