import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DeliveryService } from './delivery.service';
import { Delivery } from './schemas/delivery.schema';
import { User } from '../user/schemas/user.schema';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';
import { Role } from '../common/enums/role.enum';

describe('DeliveryService', () => {
  let service: DeliveryService;
  let deliveryModel: any;
  let userModel: any;

  const driverId = new Types.ObjectId().toHexString();
  const otherDriverId = new Types.ObjectId().toHexString();
  const adminUser = { authId: 'a1', userId: 'admin-1', email: 'admin@x.com', role: Role.ADMIN };
  const driverUser = { authId: 'd1', userId: driverId, email: 'driver@x.com', role: Role.DRIVER };

  const mockDelivery = (overrides: Partial<any> = {}) => {
    const doc = {
      _id: 'delivery-1',
      orderNumber: 'WC-ABC123',
      trackingToken: 'token123',
      status: DeliveryStatus.PENDING,
      assignedDriver: new Types.ObjectId(driverId),
      save: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
    (doc as any).toObject = jest.fn().mockReturnValue({ ...doc });
    return doc;
  };

  const mockUser = (overrides: Partial<any> = {}) => ({
    _id: driverId,
    name: 'John Driver',
    isApproved: true,
    approvalStatus: 'APPROVED',
    ...overrides,
  });

  beforeEach(async () => {
    userModel = {
      findById: jest.fn().mockResolvedValue(mockUser()),
      findByIdAndUpdate: jest.fn().mockResolvedValue(mockUser()),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: getModelToken(Delivery.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = moduleRef.get(DeliveryService);
    deliveryModel = moduleRef.get(getModelToken(Delivery.name));
  });


  describe('create', () => {
    it('creates a PENDING delivery tagged with the creating admin', async () => {
      deliveryModel.create = jest.fn().mockResolvedValue(mockDelivery());
      const result = await service.create(adminUser as any, {
        customerName: 'Jane',
        customerPhone: '555-0100',
        pickupAddress: '1 Main St',
        dropoffAddress: '2 Main St',
      });
      expect(deliveryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'admin-1', status: DeliveryStatus.PENDING }),
      );
      expect(result.data).toBeDefined();
    });
  });

  describe('assignDriver', () => {
    it('rejects assigning a driver to a delivery already in transit', async () => {
      deliveryModel.findById = jest.fn().mockResolvedValue(mockDelivery({ status: DeliveryStatus.IN_TRANSIT }));
      await expect(service.assignDriver('delivery-1', { driverId })).rejects.toThrow(BadRequestException);
    });

    it('assigns a driver to a PENDING delivery', async () => {
      const doc = mockDelivery();
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.assignDriver('delivery-1', { driverId: otherDriverId });
      expect(String(doc.assignedDriver)).toBe(otherDriverId);
      expect(doc.save).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('rejects cancelling an already-delivered order', async () => {
      deliveryModel.findById = jest.fn().mockResolvedValue(mockDelivery({ status: DeliveryStatus.DELIVERED }));
      await expect(service.cancel('delivery-1')).rejects.toThrow(BadRequestException);
    });

    it('cancels a PENDING order', async () => {
      const doc = mockDelivery();
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.cancel('delivery-1');
      expect(doc.status).toBe(DeliveryStatus.CANCELLED);
    });
  });

  describe('ownership enforcement (driver-side)', () => {
    it('throws NotFoundException for a non-existent delivery', async () => {
      deliveryModel.findById = jest.fn().mockResolvedValue(null);
      await expect(service.accept('missing', driverUser as any)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a driver tries to act on someone else\'s delivery', async () => {
      const doc = mockDelivery({ assignedDriver: new Types.ObjectId(otherDriverId) });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await expect(service.accept('delivery-1', driverUser as any)).rejects.toThrow(ForbiddenException);
    });

    it('lets an admin bypass ownership checks entirely', async () => {
      const doc = mockDelivery({ assignedDriver: new Types.ObjectId(otherDriverId) });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      const result = await service.findOne('delivery-1', adminUser as any);
      expect(result.data).toEqual(expect.objectContaining({ _id: 'delivery-1', trackingUrl: 'http://localhost:3000/track/token123' }));
    });

  });

  describe('status transition guards', () => {
    it('accept only works from PENDING', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.ACCEPTED });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await expect(service.accept('delivery-1', driverUser as any)).rejects.toThrow(BadRequestException);
    });

    it('markPickedUp only works from ACCEPTED', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.PENDING });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await expect(service.markPickedUp('delivery-1', driverUser as any)).rejects.toThrow(BadRequestException);
    });

    it('markInTransit only works from PICKED_UP', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.ACCEPTED });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await expect(service.markInTransit('delivery-1', driverUser as any)).rejects.toThrow(BadRequestException);
    });

    it('submitProofOfDelivery only works from IN_TRANSIT, and completes the order', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.IN_TRANSIT });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      const result = await service.submitProofOfDelivery('delivery-1', driverUser as any, {
        proofOfDeliveryImage: 'https://example.com/proof.jpg',
        recipientName: 'John Doe',
      });
      expect(doc.status).toBe(DeliveryStatus.DELIVERED);
      expect(doc.deliveredAt).toBeInstanceOf(Date);
      expect(result.data).toBe(doc);
    });

    it('reject only works from PENDING and clears the driver assignment', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.PENDING });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.reject('delivery-1', driverUser as any, { reason: 'Too far' });
      expect(doc.status).toBe(DeliveryStatus.REJECTED);
      expect(doc.assignedDriver).toBeNull();
      expect(doc.rejectionReason).toBe('Too far');
    });
  });

  describe('updateLocation', () => {
    it('stores a GeoJSON point from lng/lat', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.IN_TRANSIT });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.updateLocation('delivery-1', driverUser as any, { lng: -73.99, lat: 40.73 });
      expect(doc.currentLocation).toEqual({ type: 'Point', coordinates: [-73.99, 40.73] });
    });
  });

  describe('getDriverStats', () => {
    it('aggregates pending/active/completed counts for the requesting driver only', async () => {
      deliveryModel.countDocuments = jest
        .fn()
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(2) // active (accepted/picked-up/in-transit)
        .mockResolvedValueOnce(1); // completed today
      deliveryModel.aggregate = jest.fn().mockResolvedValue([
        { _id: '2026-07-10', count: 2 },
        { _id: '2026-07-11', count: 1 },
      ]);

      const result = await service.getDriverStats(driverUser as any);

      expect(result.data.pendingCount).toBe(3);
      expect(result.data.activeCount).toBe(2);
      expect(result.data.completedToday).toBe(1);
      expect(result.data.completedLast7Days).toEqual([
        { date: '2026-07-10', count: 2 },
        { date: '2026-07-11', count: 1 },
      ]);
    });
  });

  describe('findAllForAdmin pagination', () => {
    it('computes totalPages from total/limit', async () => {
      const find = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) };
      deliveryModel.find = jest.fn().mockReturnValue(find);
      deliveryModel.countDocuments = jest.fn().mockResolvedValue(45);

      const result = await service.findAllForAdmin({ page: 2, limit: 20 });
      expect(result.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
    });
  });
});
