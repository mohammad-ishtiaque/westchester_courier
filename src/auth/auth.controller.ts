import { Body, Controller, HttpCode, HttpStatus, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ResendActivationDto } from './dto/resend-activation.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
    };
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('resend-activation-code')
  resendActivationCode(@Body() dto: ResendActivationDto) {
    return this.authService.resendActivationCode(dto);
  }

  @Public()
  @Post('activate-account')
  async activateAccount(
    @Body() dto: ActivateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.activateAccount(dto);
    res.cookie('refreshToken', result.data.refreshToken, this.cookieOptions());
    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    res.cookie('refreshToken', result.data.refreshToken, this.cookieOptions());
    return result;
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // No @Public() — protected by the global JwtAuthGuard, any authenticated role may
  // change their own password (equivalent to the template's auth(config.auth_level.user)).
  @Patch('change-password')
  changePassword(@CurrentUser() user: TokenPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }
}
