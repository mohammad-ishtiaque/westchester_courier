import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Auth, AuthDocument } from './schemas/auth.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Admin, AdminDocument } from '../admin/schemas/admin.schema';
import { Role } from '../common/enums/role.enum';
import { TokenPayload } from '../common/interfaces/token-payload.interface';
import { generateCode } from '../common/utils/code-generator.util';
import { MailService } from '../common/mail/mail.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ResendActivationDto } from './dto/resend-activation.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

// Set to true only outside production: OTP codes are handed back directly in the API
// response instead of only being emailed, so every Auth endpoint is testable end-to-end
// in Postman without needing a real inbox. Mirrors what MailService does (logs instead
// of hard-failing when SMTP isn't configured) for the same reason. Flagged clearly in
// every response with a `dev*Code` key so it's obvious this must never ship to prod.
@Injectable()
export class AuthService {
  private readonly isProd: boolean;

  constructor(
    @InjectModel(Auth.name) private readonly authModel: Model<AuthDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
  }

  private signTokens(payload: TokenPayload) {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_EXPIRES_IN') ?? '1d') as any,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '365d') as any,
    });
    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException("Password and Confirm Password didn't match");
    }

    const { code: activationCode, expiresAt: activationCodeExpire } = generateCode(3);
    const expiresInMinutes = 3;

    const existing = await this.authModel.findOne({ email: dto.email });
    if (existing) {
      if (existing.isActive) {
        return { message: 'Account active. Please Login', data: { isActive: true } };
      }
      existing.activationCode = activationCode;
      existing.activationCodeExpire = activationCodeExpire;
      await existing.save();
      await this.mailService.sendOtpResendEmail(dto.email, existing.name, activationCode, expiresInMinutes);
      return {
        message: 'Already have an account. Please activate',
        data: {
          isActive: false,
          ...(!this.isProd && { devActivationCode: activationCode }),
        },
      };
    }

    const auth = await this.authModel.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: dto.role,
      activationCode,
      activationCodeExpire,
    });

    const profileData = { authId: auth._id, name: dto.name, email: dto.email };
    if (dto.role === Role.ADMIN || dto.role === Role.SUPER_ADMIN) {
      await this.adminModel.create(profileData);
    } else {
      await this.userModel.create(profileData);
    }

    if (dto.role !== Role.ADMIN && dto.role !== Role.SUPER_ADMIN) {
      await this.mailService.sendActivationEmail(dto.email, dto.name, activationCode, expiresInMinutes);
    }

    return {
      message: 'Account created successfully. Please check your email',
      data: {
        isActive: false,
        ...(!this.isProd && { devActivationCode: activationCode }),
      },
    };
  }

  async resendActivationCode(dto: ResendActivationDto) {
    const auth = await this.authModel.findOne({ email: dto.email });
    if (!auth) throw new BadRequestException('Email not found!');

    const { code: activationCode, expiresAt: activationCodeExpire } = generateCode(3);
    auth.activationCode = activationCode;
    auth.activationCodeExpire = activationCodeExpire;
    await auth.save();

    await this.mailService.sendOtpResendEmail(dto.email, auth.name, activationCode, 3);

    return {
      message: 'Resent successfully',
      data: { ...(!this.isProd && { devActivationCode: activationCode }) },
    };
  }

  async activateAccount(dto: ActivateAccountDto) {
    const auth = await this.authModel.findOne({ email: dto.email });
    // console.log(auth)
    if (!auth) throw new NotFoundException('User not found');
    if (!auth.activationCode) {
      throw new NotFoundException('Activation code not found. Get a new activation code');
    }
    if (auth.activationCode !== dto.activationCode) {
      throw new BadRequestException("Code didn't match!");
    }
    if (auth.activationCodeExpire && auth.activationCodeExpire.getTime() < Date.now()) {
      throw new BadRequestException('Activation code has expired. Request a new one');
    }

    auth.isActive = true;
    auth.activationCode = undefined;
    auth.activationCodeExpire = undefined;
    await auth.save();

    const profile = await this.findProfile(auth);
    if (!profile) throw new NotFoundException('Account detail not found');

    const tokens = this.signTokens({
      authId: String(auth._id),
      userId: String(profile._id),
      email: auth.email,
      role: auth.role,
    });

    const userProfile = profile as any;
    return {
      message: 'Activation code verified successfully.',
      data: {
        ...tokens,
        user: {
          id: profile._id,
          email: auth.email,
          role: auth.role,
          isProfileCompleted: userProfile.isProfileCompleted ?? true,
          isApproved: userProfile.isApproved ?? true,
          approvalStatus: userProfile.approvalStatus ?? 'APPROVED',
        },
      },
    };
  }

  async login(dto: LoginDto) {
    const auth = await this.authModel.findOne({ email: dto.email }).select('+password');
    if (!auth) throw new NotFoundException('User does not exist');
    if (!auth.isActive) {
      throw new BadRequestException('Please activate your account then try to login');
    }
    if (auth.isBlocked) throw new ForbiddenException('You are blocked. Contact support');

    const matches = await bcrypt.compare(dto.password, auth.password);
    if (!matches) throw new BadRequestException('Password is incorrect');

    const profile = await this.findProfile(auth);
    if (!profile) throw new NotFoundException('Account detail not found');

    const tokens = this.signTokens({
      authId: String(auth._id),
      userId: String(profile._id),
      email: auth.email,
      role: auth.role,
    });

    const userProfile = profile as any;
    return {
      message: 'Log in successful',
      data: {
        ...tokens,
        user: {
          id: profile._id,
          email: auth.email,
          role: auth.role,
          isProfileCompleted: userProfile.isProfileCompleted ?? true,
          isApproved: userProfile.isApproved ?? true,
          approvalStatus: userProfile.approvalStatus ?? 'APPROVED',
        },
      },
    };
  }


  async forgotPassword(dto: ForgotPasswordDto) {
    const auth = await this.authModel.findOne({ email: dto.email });
    if (!auth) throw new BadRequestException('User not found!');

    const { code: verificationCode, expiresAt: verificationCodeExpire } = generateCode(3);
    auth.verificationCode = verificationCode;
    auth.verificationCodeExpire = verificationCodeExpire;
    await auth.save();

    await this.mailService.sendResetPasswordEmail(dto.email, auth.name, verificationCode, 3);

    return {
      message: 'Check your email!',
      data: { ...(!this.isProd && { devVerificationCode: verificationCode }) },
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const auth = await this.authModel.findOne({ email: dto.email });
    if (!auth) throw new NotFoundException('Account does not exist!');
    if (!auth.verificationCode) {
      throw new NotFoundException('No verification code. Get a new verification code');
    }
    if (auth.verificationCode !== dto.code) {
      throw new BadRequestException('Invalid verification code!');
    }
    if (auth.verificationCodeExpire && auth.verificationCodeExpire.getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired. Request a new one');
    }

    auth.isVerified = true;
    auth.verificationCode = undefined;
    await auth.save();

    return { message: 'Code verified successfully' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const auth = await this.authModel.findOne({ email: dto.email });
    if (!auth) throw new NotFoundException('User not found!');
    if (!auth.isVerified) {
      throw new ForbiddenException('Please complete OTP verification');
    }

    auth.password = dto.newPassword; // pre-save hook hashes this
    auth.isVerified = false;
    auth.verificationCodeExpire = undefined;
    await auth.save();

    return { message: 'Password has been reset successfully.' };
  }

  async changePassword(user: TokenPayload, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Password and confirm password do not match');
    }

    const auth = await this.authModel.findOne({ email: user.email }).select('+password');
    if (!auth) throw new NotFoundException('Account does not exist!');

    const matches = await bcrypt.compare(dto.oldPassword, auth.password);
    if (!matches) throw new BadRequestException('Old password is incorrect');

    auth.password = dto.newPassword; // pre-save hook hashes this
    await auth.save();

    return { message: 'Password changed successfully!' };
  }

  // Mirrors the template's node-cron job: strips expired activation/verification
  // codes so a stale code can never be reused, and so "has this expired" checks
  // stay simple (just check the field's absence) elsewhere.
  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredCodes() {
    const now = new Date();
    await this.authModel.updateMany(
      { activationCodeExpire: { $lte: now } },
      { $unset: { activationCode: '', activationCodeExpire: '' } },
    );
    await this.authModel.updateMany(
      { verificationCodeExpire: { $lte: now } },
      { $unset: { isVerified: '', verificationCode: '', verificationCodeExpire: '' } },
    );
  }

  private async findProfile(auth: AuthDocument) {
    if (auth.role === Role.ADMIN || auth.role === Role.SUPER_ADMIN) {
      return this.adminModel.findOne({ authId: auth._id });
    }
    return this.userModel.findOne({ authId: auth._id });
  }
}
