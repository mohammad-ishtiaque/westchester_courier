import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');
import { AuthService } from './auth.service';
import { Auth } from './schemas/auth.schema';
import { User } from '../user/schemas/user.schema';
import { Admin } from '../admin/schemas/admin.schema';
import { MailService } from '../common/mail/mail.service';
import { Role } from '../common/enums/role.enum';

// These tests mock every Mongoose model, so they run with zero database dependency —
// they verify AuthService's business logic (validation branches, role routing, token
// issuance) in isolation. They do NOT prove the app works end-to-end against a real
// MongoDB — that's the separate live-endpoint pass documented in the Postman guide.
describe('AuthService', () => {
  let service: AuthService;
  let authModel: any;
  let userModel: any;
  let adminModel: any;
  let mailService: MailService;

  const mockAuthDoc = (overrides: Partial<any> = {}) => ({
    _id: 'auth-id-1',
    name: 'Test Driver',
    email: 'driver@example.com',
    password: 'hashed-password',
    role: Role.DRIVER,
    isActive: true,
    isBlocked: false,
    isVerified: false,
    activationCode: undefined,
    activationCodeExpire: undefined,
    verificationCode: undefined,
    verificationCodeExpire: undefined,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(Auth.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Admin.name), useValue: {} },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                NODE_ENV: 'test',
                JWT_SECRET: 'secret',
                JWT_EXPIRES_IN: '1d',
                JWT_REFRESH_SECRET: 'refresh-secret',
                JWT_REFRESH_EXPIRES_IN: '365d',
              };
              return values[key];
            }),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendActivationEmail: jest.fn().mockResolvedValue(undefined),
            sendOtpResendEmail: jest.fn().mockResolvedValue(undefined),
            sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    authModel = moduleRef.get(getModelToken(Auth.name));
    userModel = moduleRef.get(getModelToken(User.name));
    adminModel = moduleRef.get(getModelToken(Admin.name));
    mailService = moduleRef.get(MailService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('rejects mismatched password/confirmPassword', async () => {
      await expect(
        service.register({
          name: 'A',
          email: 'a@a.com',
          password: 'pass123',
          confirmPassword: 'different',
          role: Role.DRIVER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new Auth + User profile for a DRIVER and emails an activation code', async () => {
      authModel.findOne = jest.fn().mockResolvedValue(null);
      authModel.create = jest.fn().mockResolvedValue({ _id: 'new-auth-id' });
      userModel.create = jest.fn().mockResolvedValue({ _id: 'new-user-id' });

      const result = await service.register({
        name: 'New Driver',
        email: 'new@driver.com',
        password: 'pass123',
        confirmPassword: 'pass123',
        role: Role.DRIVER,
      });

      expect(authModel.create).toHaveBeenCalled();
      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ authId: 'new-auth-id', email: 'new@driver.com' }),
      );
      expect(mailService.sendActivationEmail).toHaveBeenCalled();
      expect(result.data.isActive).toBe(false);
      // dev convenience field — see class doc comment on AuthService
      expect(result.data).toHaveProperty('devActivationCode');
    });

    it('routes ADMIN registration to the Admin profile collection and skips the activation email', async () => {
      authModel.findOne = jest.fn().mockResolvedValue(null);
      authModel.create = jest.fn().mockResolvedValue({ _id: 'new-admin-auth-id' });
      adminModel.create = jest.fn().mockResolvedValue({ _id: 'new-admin-id' });

      await service.register({
        name: 'New Admin',
        email: 'new@admin.com',
        password: 'pass123',
        confirmPassword: 'pass123',
        role: Role.ADMIN,
      });

      expect(adminModel.create).toHaveBeenCalled();
      expect(mailService.sendActivationEmail).not.toHaveBeenCalled();
    });

    it('resends an activation code instead of erroring when the email exists but is inactive', async () => {
      const existing = mockAuthDoc({ isActive: false });
      authModel.findOne = jest.fn().mockResolvedValue(existing);

      const result = await service.register({
        name: 'Test Driver',
        email: existing.email,
        password: 'pass123',
        confirmPassword: 'pass123',
        role: Role.DRIVER,
      });

      expect(existing.save).toHaveBeenCalled();
      expect(mailService.sendOtpResendEmail).toHaveBeenCalled();
      expect(result.message).toMatch(/already have an account/i);
    });
  });

  describe('login', () => {
    it('throws NotFoundException when the email does not exist', async () => {
      authModel.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await expect(service.login({ email: 'nope@a.com', password: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects an inactive account', async () => {
      const doc = mockAuthDoc({ isActive: false });
      authModel.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(doc) });
      await expect(service.login({ email: doc.email, password: 'x' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a blocked account', async () => {
      const doc = mockAuthDoc({ isBlocked: true });
      authModel.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(doc) });
      await expect(service.login({ email: doc.email, password: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects an incorrect password', async () => {
      const doc = mockAuthDoc();
      authModel.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(doc) });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login({ email: doc.email, password: 'wrong' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('issues access + refresh tokens on success', async () => {
      const doc = mockAuthDoc();
      authModel.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(doc) });
      userModel.findOne = jest.fn().mockResolvedValue({ _id: 'profile-id' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: doc.email, password: 'correct' });
      expect(result.data.accessToken).toBe('signed.jwt.token');
      expect(result.data.refreshToken).toBe('signed.jwt.token');
    });
  });

  describe('activateAccount', () => {
    it('rejects a non-matching activation code', async () => {
      const doc = mockAuthDoc({ activationCode: '111111' });
      authModel.findOne = jest.fn().mockResolvedValue(doc);
      await expect(
        service.activateAccount({ email: doc.email, activationCode: '999999' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired activation code', async () => {
      const doc = mockAuthDoc({
        activationCode: '111111',
        activationCodeExpire: new Date(Date.now() - 1000),
      });
      authModel.findOne = jest.fn().mockResolvedValue(doc);
      await expect(
        service.activateAccount({ email: doc.email, activationCode: '111111' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('activates the account and issues tokens on a valid code', async () => {
      const doc = mockAuthDoc({
        activationCode: '111111',
        activationCodeExpire: new Date(Date.now() + 60_000),
        isActive: false,
      });
      authModel.findOne = jest.fn().mockResolvedValue(doc);
      userModel.findOne = jest.fn().mockResolvedValue({ _id: 'profile-id' });

      const result = await service.activateAccount({ email: doc.email, activationCode: '111111' });
      expect(doc.isActive).toBe(true);
      expect(result.data.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('resetPassword', () => {
    it('rejects mismatched new/confirm password', async () => {
      await expect(
        service.resetPassword({
          email: 'a@a.com',
          newPassword: 'a',
          confirmPassword: 'b',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires OTP verification before allowing a reset', async () => {
      const doc = mockAuthDoc({ isVerified: false });
      authModel.findOne = jest.fn().mockResolvedValue(doc);
      await expect(
        service.resetPassword({
          email: doc.email,
          newPassword: 'newpass1',
          confirmPassword: 'newpass1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('resets the password once verified', async () => {
      const doc = mockAuthDoc({ isVerified: true });
      authModel.findOne = jest.fn().mockResolvedValue(doc);

      await service.resetPassword({
        email: doc.email,
        newPassword: 'newpass1',
        confirmPassword: 'newpass1',
      });
      expect(doc.password).toBe('newpass1');
      expect(doc.isVerified).toBe(false);
      expect(doc.save).toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('rejects an incorrect old password', async () => {
      const doc = mockAuthDoc();
      authModel.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(doc) });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(
          { authId: 'x', userId: 'y', email: doc.email, role: Role.DRIVER },
          { oldPassword: 'wrong', newPassword: 'newpass1', confirmPassword: 'newpass1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates the password when old password matches', async () => {
      const doc = mockAuthDoc();
      authModel.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(doc) });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.changePassword(
        { authId: 'x', userId: 'y', email: doc.email, role: Role.DRIVER },
        { oldPassword: 'correct', newPassword: 'newpass1', confirmPassword: 'newpass1' },
      );
      expect(doc.password).toBe('newpass1');
      expect(doc.save).toHaveBeenCalled();
    });
  });
});
