import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { Auth, AuthSchema } from './schemas/auth.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { AdminModule } from '../admin/admin.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Auth.name, schema: AuthSchema }]),
    UserModule,
    AdminModule,
    // Registered without a default secret/expiry — AuthService and JwtAuthGuard each
    // pass their own secret per call (access vs refresh use different secrets, same
    // as the template), so there's nothing meaningful to configure globally here.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // TEMP DEBUG: guards commented out
    // Global guards: EVERY route in the app requires a valid JWT by default unless
    // marked @Public(). This is the opposite default from the template (where each
    // route opted IN to auth(...) individually) — safer as the app grows, since a
    // forgotten @Public() fails closed instead of a forgotten auth() failing open.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [MongooseModule],
})
export class AuthModule {}
