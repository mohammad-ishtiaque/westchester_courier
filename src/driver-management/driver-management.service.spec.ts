import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DriverManagementService } from './driver-management.service';
import { Auth } from '../auth/schemas/auth.schema';
import { User } from '../user/schemas/user.schema';
import { Delivery } from '../delivery/schemas/delivery.schema';
import { Role } from '../common/enums/role.enum';

describe('DriverManagementService', () => {
  let service: DriverManagementService;
  let authModel: any;
  let userModel: any;
  let deliveryModel: any;

  const driverId = new Types.ObjectId().toHexString();
  const authId = new Types.ObjectId().toHexString();

  const mockDriver = (overrides: Partial<any> = {}) => ({
    _id: driverId,
    authId,
    name: 'Driver One',
    email: 'driver@x.com',
    assignedVehicle: null,
    toObject: function () {
      return { _id: this._id, authId: this.authId, name: this.name, email: this.email, assignedVehicle: this.assignedVehicle };
    },
    deleteOne: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DriverManagementService,
        { provide: getModelToken(Auth.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: { findById: jest.fn() } },
        { provide: getModelToken(Delivery.name), useValue: { countDocuments: jest.fn().mockResolvedValue(121) } },
      ],
    }).compile();

    service = moduleRef.get(DriverManagementService);
    authModel = moduleRef.get(getModelToken(Auth.name));
    userModel = moduleRef.get(getModelToken(User.name));
    deliveryModel = moduleRef.get(getModelToken(Delivery.name));
  });

  describe('create', () => {
    it('rejects when the email already exists', async () => {
      authModel.findOne = jest.fn().mockResolvedValue({ _id: authId });
      await expect(
        service.create({ name: 'A', email: 'a@x.com', password: 'pass1234' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('creates an already-active Auth + User profile for a driver', async () => {
      authModel.findOne = jest.fn().mockResolvedValue(null);
      authModel.create = jest.fn().mockResolvedValue({ _id: authId });
      userModel.create = jest.fn().mockResolvedValue(mockDriver());

      const result = await service.create({ name: 'Driver One', email: 'driver@x.com', password: 'pass1234' } as any);

      expect(authModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.DRIVER, isActive: true }),
      );
      expect(userModel.create).toHaveBeenCalledWith(expect.objectContaining({ authId }));
      expect(result.data).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when driver does not exist', async () => {
      userModel.findById = jest.fn().mockResolvedValue(null);
      await expect(service.findOne(driverId)).rejects.toThrow(NotFoundException);
    });

    it('merges isActive/isBlocked and returns totalCompletedDeliveries', async () => {
      userModel.findById = jest.fn().mockResolvedValue(mockDriver());
      authModel.findById = jest.fn().mockResolvedValue({ isActive: true, isBlocked: false });

      const result = await service.findOne(driverId);
      expect(result.data.isActive).toBe(true);
      expect(result.data.isBlocked).toBe(false);
      expect(result.data.totalCompletedDeliveries).toBe(121);
    });
  });

  describe('setBlocked', () => {
    it('throws NotFoundException when driver does not exist', async () => {
      userModel.findById = jest.fn().mockResolvedValue(null);
      await expect(service.setBlocked(driverId, true)).rejects.toThrow(NotFoundException);
    });

    it('blocks a driver by flipping isBlocked on their Auth record', async () => {
      userModel.findById = jest.fn().mockResolvedValue(mockDriver());
      authModel.findByIdAndUpdate = jest.fn().mockResolvedValue({ isBlocked: true });

      const result = await service.setBlocked(driverId, true);
      expect(authModel.findByIdAndUpdate).toHaveBeenCalledWith(authId, { isBlocked: true }, { new: true });
      expect(result.data.isBlocked).toBe(true);
    });
  });

  describe('remove', () => {
    it('rejects removing a driver who still has an assigned vehicle', async () => {
      userModel.findById = jest.fn().mockResolvedValue(mockDriver({ assignedVehicle: new Types.ObjectId() }));
      await expect(service.remove(driverId)).rejects.toThrow(BadRequestException);
    });

    it('removes both the Auth and User records for a driver with no assigned vehicle', async () => {
      const doc = mockDriver();
      userModel.findById = jest.fn().mockResolvedValue(doc);
      authModel.deleteOne = jest.fn().mockResolvedValue(true);

      const result = await service.remove(driverId);
      expect(authModel.deleteOne).toHaveBeenCalledWith({ _id: authId });
      expect(doc.deleteOne).toHaveBeenCalled();
      expect(result.message).toContain('removed');
    });

    it('throws NotFoundException when driver does not exist', async () => {
      userModel.findById = jest.fn().mockResolvedValue(null);
      await expect(service.remove(driverId)).rejects.toThrow(NotFoundException);
    });
  });
});
