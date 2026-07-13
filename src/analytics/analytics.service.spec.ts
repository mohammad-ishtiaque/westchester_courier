import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnalyticsService } from './analytics.service';
import { Delivery } from '../delivery/schemas/delivery.schema';
import { User } from '../user/schemas/user.schema';
import { Vehicle } from '../vehicle/schemas/vehicle.schema';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let deliveryModel: any;
  let userModel: any;
  let vehicleModel: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getModelToken(Delivery.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Vehicle.name), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(AnalyticsService);
    deliveryModel = moduleRef.get(getModelToken(Delivery.name));
    userModel = moduleRef.get(getModelToken(User.name));
    vehicleModel = moduleRef.get(getModelToken(Vehicle.name));
  });

  describe('getOverview', () => {
    it('computes completion rate and merges counts across collections', async () => {
      deliveryModel.aggregate = jest.fn().mockResolvedValue([
        {
          byStatus: [
            { _id: DeliveryStatus.DELIVERED, count: 3 },
            { _id: DeliveryStatus.PENDING, count: 1 },
          ],
          total: [{ count: 4 }],
          distinctCustomers: [{ count: 2 }],
        },
      ]);
      userModel.countDocuments = jest.fn().mockResolvedValue(5);
      vehicleModel.countDocuments = jest.fn().mockResolvedValue(2);

      const result = await service.getOverview();

      expect(result.data.totalDeliveries).toBe(4);
      expect(result.data.completionRate).toBe(75);
      expect(result.data.deliveriesByStatus[DeliveryStatus.DELIVERED]).toBe(3);
      expect(result.data.totalDrivers).toBe(5);
      expect(result.data.totalVehicles).toBe(2);
      expect(result.data.totalCustomers).toBe(2);
    });

    it('returns a zero completion rate when there are no deliveries yet', async () => {
      deliveryModel.aggregate = jest.fn().mockResolvedValue([
        { byStatus: [], total: [], distinctCustomers: [] },
      ]);
      userModel.countDocuments = jest.fn().mockResolvedValue(0);
      vehicleModel.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await service.getOverview();
      expect(result.data.totalDeliveries).toBe(0);
      expect(result.data.completionRate).toBe(0);
    });
  });

  describe('getChart', () => {
    it('fills every day in the range, including zero-order days', async () => {
      deliveryModel.aggregate = jest.fn().mockResolvedValue([]);
      const result = await service.getChart(3);
      expect(result.data).toHaveLength(3);
      expect(result.data.every((d: any) => d.totalOrders === 0)).toBe(true);
    });

    it('maps aggregation rows onto the correct date buckets', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const key = today.toISOString().slice(0, 10);
      deliveryModel.aggregate = jest.fn().mockResolvedValue([
        { _id: key, totalOrders: 5, deliveredOrders: 2 },
      ]);

      const result = await service.getChart(1);
      expect(result.data[0].date).toBe(key);
      expect(result.data[0].totalOrders).toBe(5);
      expect(result.data[0].deliveredOrders).toBe(2);
    });
  });
});
