import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AnalyticsService } from './analytics.service';
import { Delivery } from '../delivery/schemas/delivery.schema';
import { User } from '../user/schemas/user.schema';
import { Vehicle } from '../vehicle/schemas/vehicle.schema';
import { Report } from '../report/schemas/report.schema';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let deliveryModel: any;
  let userModel: any;
  let vehicleModel: any;
  let reportModel: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getModelToken(Delivery.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Vehicle.name), useValue: {} },
        { provide: getModelToken(Report.name), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(AnalyticsService);
    deliveryModel = moduleRef.get(getModelToken(Delivery.name));
    userModel = moduleRef.get(getModelToken(User.name));
    vehicleModel = moduleRef.get(getModelToken(Vehicle.name));
    reportModel = moduleRef.get(getModelToken(Report.name));
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
          todayTotal: [{ count: 1 }],
          todayCompleted: [{ count: 0 }],
        },
      ]);
      userModel.countDocuments = jest.fn().mockResolvedValue(5);
      
      reportModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              populate: jest.fn().mockResolvedValue([
                { _id: '1', delivery: { orderNumber: '123' }, driver: { name: 'John' } }
              ])
            })
          })
        })
      });

      const result = await service.getOverview();

      expect(result.data.cards.totalOrder).toBe(4);
      expect(result.data.cards.totalCompletedOrder).toBe(3);
      expect(result.data.cards.activeOrder).toBe(1);
      expect(result.data.cards.totalDriver).toBe(5);
      expect(result.data.todaysStatus.orders).toBe(1);
      expect(result.data.recentReports).toHaveLength(1);
    });
  });

  describe('getChart', () => {
    it('fills every day in the month range', async () => {
      deliveryModel.aggregate = jest.fn().mockResolvedValue([]);
      const result = await service.getChart(2023, 2); // Feb 2023 has 28 days
      expect(result.data).toHaveLength(28);
      expect(result.data.every((d: any) => d.completedOrders === 0 && d.canceledOrders === 0)).toBe(true);
    });

    it('maps aggregation rows onto the correct date buckets', async () => {
      const startDate = new Date(2023, 1, 1, 0, 0, 0, 0); // Feb 1 2023
      const key = startDate.toISOString().slice(0, 10);
      deliveryModel.aggregate = jest.fn().mockResolvedValue([
        { _id: key, completedOrders: 5, canceledOrders: 2 },
      ]);

      const result = await service.getChart(2023, 2);
      expect(result.data[0].date).toBe(key);
      expect(result.data[0].completedOrders).toBe(5);
      expect(result.data[0].canceledOrders).toBe(2);
    });
  });
});
