import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { User } from '../user/schemas/user.schema';
import { Admin } from '../admin/schemas/admin.schema';
import { Role } from '../common/enums/role.enum';

describe('ProfileService', () => {
  let service: ProfileService;
  let userModel: any;
  let adminModel: any;

  const driverUser = { authId: 'a1', userId: 'driver-1', email: 'driver@x.com', role: Role.DRIVER };
  const adminUser = { authId: 'a2', userId: 'admin-1', email: 'admin@x.com', role: Role.ADMIN };

  const mockProfile = (overrides: Partial<any> = {}) => ({
    _id: 'profile-1',
    name: 'Original Name',
    phoneNumber: '555-0000',
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Admin.name), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ProfileService);
    userModel = moduleRef.get(getModelToken(User.name));
    adminModel = moduleRef.get(getModelToken(Admin.name));
  });

  describe('getMe', () => {
    it('routes DRIVER to the User collection', async () => {
      const profile = mockProfile();
      userModel.findById = jest.fn().mockResolvedValue(profile);
      const result = await service.getMe(driverUser as any);
      expect(userModel.findById).toHaveBeenCalledWith('driver-1');
      expect(result.data).toBe(profile);
    });

    it('routes ADMIN to the Admin collection', async () => {
      const profile = mockProfile();
      adminModel.findById = jest.fn().mockResolvedValue(profile);
      const result = await service.getMe(adminUser as any);
      expect(adminModel.findById).toHaveBeenCalledWith('admin-1');
      expect(result.data).toBe(profile);
    });

    it('throws NotFoundException when the profile is missing', async () => {
      userModel.findById = jest.fn().mockResolvedValue(null);
      await expect(service.getMe(driverUser as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('only touches fields that were actually provided', async () => {
      const profile = mockProfile();
      userModel.findById = jest.fn().mockResolvedValue(profile);

      await service.updateMe(driverUser as any, { name: 'New Name' });

      expect(profile.name).toBe('New Name');
      expect(profile.phoneNumber).toBe('555-0000'); // untouched
      expect(profile.save).toHaveBeenCalled();
    });

    it('maps profileImage onto the schema field profile_image', async () => {
      const profile = mockProfile();
      adminModel.findById = jest.fn().mockResolvedValue(profile);

      await service.updateMe(adminUser as any, { profileImage: 'https://example.com/a.jpg' });

      expect(profile.profile_image).toBe('https://example.com/a.jpg');
    });
  });
});
