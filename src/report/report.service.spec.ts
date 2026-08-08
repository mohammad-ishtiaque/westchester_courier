import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ReportService } from './report.service';
import { Report } from './schemas/report.schema';
import { Delivery } from '../delivery/schemas/delivery.schema';
import { NotificationService } from '../notification/notification.service';
import { ReportStatus } from '../common/enums/report-status.enum';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';

describe('ReportService', () => {
  let service: ReportService;
  let reportModel: any;
  let deliveryModel: any;
  let notificationService: any;

  const mockReportDoc = {
    _id: 'r1',
    status: ReportStatus.PENDING,
    delivery: 'd1',
    save: jest.fn().mockResolvedValue(true),
  };

  const mockDeliveryDoc = {
    _id: 'd1',
    orderNumber: 'WC-12345',
    status: DeliveryStatus.IN_TRANSIT,
    assignedDriver: 'dr1',
    save: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    reportModel = {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue({
            ...mockReportDoc,
            status: ReportStatus.RESOLVED,
          }),
        }),
        ...mockReportDoc,
      }),
    };

    deliveryModel = {
      findById: jest.fn().mockResolvedValue(mockDeliveryDoc),
    };

    notificationService = {
      sendNotification: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        { provide: getModelToken(Report.name), useValue: reportModel },
        { provide: getModelToken(Delivery.name), useValue: deliveryModel },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('updates report status and changes linked delivery status when deliveryStatus is passed', async () => {
    reportModel.findById = jest.fn().mockImplementation((id) => {
      return {
        ...mockReportDoc,
        save: jest.fn().mockResolvedValue(true),
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue({
            ...mockReportDoc,
            status: ReportStatus.RESOLVED,
          }),
        }),
      };
    });

    const result = await service.updateStatus('r1', {
      status: ReportStatus.RESOLVED,
      deliveryStatus: DeliveryStatus.CANCELLED,
      reason: 'Issue confirmed by admin',
    });

    expect(deliveryModel.findById).toHaveBeenCalledWith('d1');
    expect(mockDeliveryDoc.status).toBe(DeliveryStatus.CANCELLED);
    expect(notificationService.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRole: 'DRIVER',
        title: 'Delivery Status Updated',
      }),
    );
    expect(result.message).toBe('Report status updated successfully');
  });
});
