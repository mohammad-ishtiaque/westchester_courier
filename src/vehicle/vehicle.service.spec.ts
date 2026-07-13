import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { VehicleService } from './vehicle.service';
import { Vehicle } from './schemas/vehicle.schema';
import { User } from '../user/schemas/user.schema';
import { VehicleStatus } from '../common/enums/vehicle-status.enum';

describe('VehicleService', () => {
  let service: VehicleService;
  let vehicleModel: any;
  let userModel: any;

  const vehicleId = new Types.ObjectId().toHexString();
  const driverId = new Types.ObjectId().toHexString();
  const otherDriverId = new Types.ObjectId().toHexString();

  const mockVehicle = (overrides: Partial<any> = {}) => ({
    _id: vehicleId,
    make: 'Honda',
    vehicleModelName: 'Civic',
    plateNumber: 'ABC123',
    status: VehicleStatus.ACTIVE,
    assignedDriver: null,
    save: jest.fn().mockResolvedValue(true),
    deleteOne: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  const mockDriver = (overrides: Partial<any> = {}) => ({
    _id: driverId,
    name: 'Driver One',
    assignedVehicle: null,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        VehicleService,
        { provide: getModelToken(Vehicle.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(VehicleService);
    vehicleModel = moduleRef.get(getModelToken(Vehicle.name));
    userModel = moduleRef.get(getModelToken(User.name));
  });

  describe('create', () => {
    it('creates a vehicle with default ACTIVE status', async () => {
      vehicleModel.create = jest.fn().mockResolvedValue(mockVehicle());
      const result = await service.create({
        make: 'Honda',
        vehicleModelName: 'Civic',
        plateNumber: 'ABC123',
      } as any);
      expect(vehicleModel.create).toHaveBeenCalled();
      expect(result.data).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when vehicle does not exist', async () => {
      vehicleModel.findById = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      await expect(service.findOne(vehicleId)).rejects.toThrow(NotFoundException);
    });

    it('returns the vehicle when found', async () => {
      vehicleModel.findById = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockVehicle()) });
      const result = await service.findOne(vehicleId);
      expect(result.data).toBeDefined();
    });
  });

  describe('remove', () => {
    it('rejects removing a vehicle that still has an assigned driver', async () => {
      vehicleModel.findById = jest.fn().mockResolvedValue(mockVehicle({ assignedDriver: driverId }));
      await expect(service.remove(vehicleId)).rejects.toThrow(BadRequestException);
    });

    it('removes a vehicle with no assigned driver', async () => {
      const doc = mockVehicle();
      vehicleModel.findById = jest.fn().mockResolvedValue(doc);
      const result = await service.remove(vehicleId);
      expect(doc.deleteOne).toHaveBeenCalled();
      expect(result.message).toContain('removed');
    });

    it('throws NotFoundException when vehicle does not exist', async () => {
      vehicleModel.findById = jest.fn().mockResolvedValue(null);
      await expect(service.remove(vehicleId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('assign', () => {
    it('throws NotFoundException when vehicle does not exist', async () => {
      vehicleModel.findById = jest.fn().mockResolvedValue(null);
      await expect(service.assign(vehicleId, { driverId } as any)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when driver does not exist', async () => {
      vehicleModel.findById = jest.fn().mockResolvedValue(mockVehicle());
      userModel.findById = jest.fn().mockResolvedValue(null);
      await expect(service.assign(vehicleId, { driverId } as any)).rejects.toThrow(NotFoundException);
    });

    it('assigns a free vehicle to a free driver, syncing both sides', async () => {
      const vehicleDoc = mockVehicle();
      const driverDoc = mockDriver();
      vehicleModel.findById = jest.fn().mockResolvedValue(vehicleDoc);
      userModel.findById = jest.fn().mockResolvedValue(driverDoc);
      userModel.updateOne = jest.fn().mockResolvedValue(true);
      vehicleModel.updateOne = jest.fn().mockResolvedValue(true);

      await service.assign(vehicleId, { driverId } as any);

      expect(String(vehicleDoc.assignedDriver)).toBe(driverId);
      expect(vehicleDoc.save).toHaveBeenCalled();
      expect(String(driverDoc.assignedVehicle)).toBe(vehicleId);
      expect(driverDoc.save).toHaveBeenCalled();
      // no previous assignments on either side, so neither cleanup update should fire
      expect(userModel.updateOne).not.toHaveBeenCalled();
      expect(vehicleModel.updateOne).not.toHaveBeenCalled();
    });

    it('unassigns the previous driver and the driver\'s previous vehicle before reassigning', async () => {
      const previousDriverObjectId = new Types.ObjectId(otherDriverId);
      const previousVehicleObjectId = new Types.ObjectId();
      const vehicleDoc = mockVehicle({ assignedDriver: previousDriverObjectId });
      const driverDoc = mockDriver({ assignedVehicle: previousVehicleObjectId });
      vehicleModel.findById = jest.fn().mockResolvedValue(vehicleDoc);
      userModel.findById = jest.fn().mockResolvedValue(driverDoc);
      userModel.updateOne = jest.fn().mockResolvedValue(true);
      vehicleModel.updateOne = jest.fn().mockResolvedValue(true);

      await service.assign(vehicleId, { driverId } as any);

      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: previousDriverObjectId },
        { assignedVehicle: null },
      );
      expect(vehicleModel.updateOne).toHaveBeenCalledWith(
        { _id: previousVehicleObjectId },
        { assignedDriver: null },
      );
    });
  });
});
