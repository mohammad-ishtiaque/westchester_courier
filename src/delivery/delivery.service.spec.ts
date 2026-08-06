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
      findOne: jest.fn().mockResolvedValue(mockUser()),
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
    it('creates an UNASSIGNED delivery tagged with the creating admin when no driver is provided', async () => {
      deliveryModel.create = jest.fn().mockResolvedValue(mockDelivery({ status: DeliveryStatus.UNASSIGNED }));
      const result = await service.create(adminUser as any, {
        customerName: 'Jane',
        customerPhone: '555-0100',
        pickupAddress: '1 Main St',
        dropoffAddress: '2 Main St',
      });
      expect(deliveryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'admin-1', status: DeliveryStatus.UNASSIGNED }),
      );
      expect(result.data).toBeDefined();
    });

    it('creates an ASSIGNED delivery when a valid driver is assigned on creation', async () => {
      const createdDoc = mockDelivery({ status: DeliveryStatus.ASSIGNED, assignedDriver: driverId });
      deliveryModel.create = jest.fn().mockResolvedValue(createdDoc);
      deliveryModel.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(createdDoc),
      });
      userModel.findOne = jest.fn().mockResolvedValue(mockUser({ role: Role.DRIVER, isApproved: true }));

      const result = await service.create(adminUser as any, {
        customerName: 'Jane',
        customerPhone: '555-0100',
        pickupAddress: '1 Main St',
        dropoffAddress: '2 Main St',
        driverId,
      });

      expect(deliveryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'admin-1', status: DeliveryStatus.ASSIGNED }),
      );
      expect(result.data).toBeDefined();
    });

    it('throws NotFoundException if driverId does not exist', async () => {
      userModel.findOne = jest.fn().mockResolvedValue(null);
      await expect(
        service.create(adminUser as any, {
          customerName: 'Jane',
          customerPhone: '555-0100',
          pickupAddress: '1 Main St',
          dropoffAddress: '2 Main St',
          driverId: 'invalid-id',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if assigned driver is not approved', async () => {
      userModel.findOne = jest.fn().mockResolvedValue(mockUser({ role: Role.DRIVER, isApproved: false }));
      await expect(
        service.create(adminUser as any, {
          customerName: 'Jane',
          customerPhone: '555-0100',
          pickupAddress: '1 Main St',
          dropoffAddress: '2 Main St',
          driverId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignDriver & removeDriver', () => {
    it('rejects assigning a driver to a delivery already in transit', async () => {
      deliveryModel.findById = jest.fn().mockResolvedValue(mockDelivery({ status: DeliveryStatus.IN_TRANSIT }));
      await expect(service.assignDriver('delivery-1', { driverId })).rejects.toThrow(BadRequestException);
    });

    it('assigns a driver to an UNASSIGNED delivery', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.UNASSIGNED });
      userModel.findOne = jest.fn().mockResolvedValue(mockUser({ _id: otherDriverId }));
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.assignDriver('delivery-1', { driverId: otherDriverId });
      expect(String(doc.assignedDriver)).toBe(otherDriverId);
      expect(doc.status).toBe(DeliveryStatus.ASSIGNED);
      expect(doc.save).toHaveBeenCalled();
    });

    it('removes assigned driver before driver accepts', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.ASSIGNED, assignedDriver: new Types.ObjectId(otherDriverId) });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.removeDriver('delivery-1');
      expect(doc.assignedDriver).toBeNull();
      expect(doc.status).toBe(DeliveryStatus.UNASSIGNED);
    });
  });

  describe('cancel', () => {
    it('rejects cancelling an already-delivered order', async () => {
      deliveryModel.findById = jest.fn().mockResolvedValue(mockDelivery({ status: DeliveryStatus.DELIVERED }));
      await expect(service.cancel('delivery-1')).rejects.toThrow(BadRequestException);
    });

    it('cancels an UNASSIGNED order', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.UNASSIGNED });
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
      deliveryModel.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(doc),
      });
      const result = await service.findOne('delivery-1', adminUser as any);
      expect(result.data).toEqual(expect.objectContaining({ _id: 'delivery-1', trackingUrl: 'http://localhost:2050/track/token123' }));
    });

    it('returns map details for assigned delivery', async () => {
      const doc = mockDelivery({
        assignedDriver: new Types.ObjectId(driverId),
        pickupCoordinates: { type: 'Point', coordinates: [-73.76, 41.03] },
        dropoffCoordinates: { type: 'Point', coordinates: [-73.77, 41.04] },
      });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      userModel.findById = jest.fn().mockResolvedValue(mockUser());

      const result = await service.getMapDetails('delivery-1', driverUser as any);
      expect(result.data).toEqual(
        expect.objectContaining({
          _id: 'delivery-1',
          pickupCoordinates: { type: 'Point', coordinates: [-73.76, 41.03] },
          dropoffCoordinates: { type: 'Point', coordinates: [-73.77, 41.04] },
        }),
      );
    });
  });

  describe('status transition guards', () => {
    it('accept only works from ASSIGNED', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.DRIVER_ACCEPTED });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await expect(service.accept('delivery-1', driverUser as any)).rejects.toThrow(BadRequestException);
    });

    it('markPickedUp works from DRIVER_ACCEPTED or DRIVER_TO_PICKUP', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.DRIVER_ACCEPTED });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.markPickedUp('delivery-1', driverUser as any);
      expect(doc.status).toBe(DeliveryStatus.PICKED_UP);
    });

    it('markInTransit only works from PICKED_UP', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.DRIVER_ACCEPTED });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await expect(service.markInTransit('delivery-1', driverUser as any)).rejects.toThrow(BadRequestException);
    });

    it('submitProofOfDelivery works from OUT_FOR_DELIVERY, and completes the order', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.OUT_FOR_DELIVERY });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      const result = await service.submitProofOfDelivery('delivery-1', driverUser as any, {
        proofOfDeliveryImage: 'https://example.com/proof.jpg',
        recipientName: 'John Doe',
      });
      expect(doc.status).toBe(DeliveryStatus.DELIVERED);
      expect(doc.deliveredAt).toBeInstanceOf(Date);
      expect(result.data).toBe(doc);
    });

    it('reject only works from ASSIGNED and clears the driver assignment', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.ASSIGNED });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.reject('delivery-1', driverUser as any, { reason: 'Too far' });
      expect(doc.status).toBe(DeliveryStatus.REJECTED);
      expect(doc.assignedDriver).toBeNull();
      expect(doc.rejectionReason).toBe('Too far');
    });

    it('updateStatus delegates driver status changes to appropriate handlers', async () => {
      const doc = mockDelivery({ status: DeliveryStatus.ASSIGNED });
      deliveryModel.findById = jest.fn().mockResolvedValue(doc);
      await service.updateStatus('delivery-1', driverUser as any, { status: DeliveryStatus.DRIVER_ACCEPTED });
      expect(doc.status).toBe(DeliveryStatus.DRIVER_ACCEPTED);
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
        .mockResolvedValueOnce(3) // pending (ASSIGNED)
        .mockResolvedValueOnce(2) // active (accepted/picked-up/in-transit)
        .mockResolvedValueOnce(10) // total completed
        .mockResolvedValueOnce(1); // completed today
      deliveryModel.aggregate = jest.fn().mockResolvedValue([
        { _id: '2026-07-10', count: 2 },
        { _id: '2026-07-11', count: 1 },
      ]);

      const result = await service.getDriverStats(driverUser as any);

      expect(result.data.pendingTaskCount).toBe(5);
      expect(result.data.completedTaskCount).toBe(10);
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

  describe('getDriverRequests', () => {
    it('fetches driver requests with counts for pending and accepted', async () => {
      const items = [
        mockDelivery({ status: DeliveryStatus.ASSIGNED }),
        mockDelivery({ status: DeliveryStatus.DRIVER_ACCEPTED }),
      ];
      const find = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(items) };
      deliveryModel.find = jest.fn().mockReturnValue(find);
      deliveryModel.countDocuments = jest
        .fn()
        .mockResolvedValueOnce(4) // pending count
        .mockResolvedValueOnce(2) // accepted count
        .mockResolvedValueOnce(6); // total list count

      const result = await service.getDriverRequests(driverUser as any, { type: 'all' as any });

      expect(result.data.length).toBe(2);
      expect(result.meta.total).toBe(6);
      expect(result.meta.pendingRequestCount).toBe(4);
      expect(result.meta.acceptedCount).toBe(2);
      // No top-level duplicates
      expect((result as any).pendingRequest).toBeUndefined();
      expect((result as any).summary).toBeUndefined();
    });
  });
});
