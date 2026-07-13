import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { Delivery } from '../delivery/schemas/delivery.schema';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';

describe('CustomerService', () => {
  let service: CustomerService;
  let deliveryModel: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomerService,
        { provide: getModelToken(Delivery.name), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(CustomerService);
    deliveryModel = moduleRef.get(getModelToken(Delivery.name));
  });

  describe('findAll', () => {
    it('returns the grouped/paginated customer list from the aggregation result', async () => {
      deliveryModel.aggregate = jest.fn().mockResolvedValue([
        {
          data: [
            { _id: '555-0100', customerName: 'Jane', totalOrders: 3, lastOrderAt: new Date(), lastAddress: '2 Main St' },
          ],
          totalCount: [{ count: 1 }],
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 20 } as any);

      expect(deliveryModel.aggregate).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].customerPhone).toBe('555-0100');
      expect(result.meta.total).toBe(1);
    });

    it('applies a search filter into the aggregation $match stage', async () => {
      deliveryModel.aggregate = jest.fn().mockResolvedValue([{ data: [], totalCount: [] }]);
      await service.findAll({ search: 'jane', page: 1, limit: 20 } as any);

      const pipeline = deliveryModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.$or).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when no deliveries exist for that phone', async () => {
      deliveryModel.find = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
      await expect(service.findOne('555-0000')).rejects.toThrow(NotFoundException);
    });

    it('summarizes order history for a known customer phone', async () => {
      const deliveries = [
        { customerName: 'Jane', status: DeliveryStatus.DELIVERED, createdAt: new Date() },
        { customerName: 'Jane', status: DeliveryStatus.PENDING, createdAt: new Date() },
      ];
      deliveryModel.find = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(deliveries) });

      const result = await service.findOne('555-0100');
      expect(result.data.totalOrders).toBe(2);
      expect(result.data.deliveredOrders).toBe(1);
      expect(result.data.customerName).toBe('Jane');
    });
  });
});
