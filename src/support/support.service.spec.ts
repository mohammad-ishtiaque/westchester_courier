import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SupportService } from './support.service';
import { Support } from './schemas/support.schema';
import { NotificationService } from '../notification/notification.service';
import { Role } from '../common/enums/role.enum';

describe('SupportService', () => {
  let service: SupportService;
  let supportModel: any;
  let notificationService: any;

  const mockDriverPayload = {
    authId: 'a1',
    userId: 'd1',
    email: 'driver@test.com',
    role: Role.DRIVER,
  };

  beforeEach(async () => {
    supportModel = {
      create: jest.fn().mockImplementation((dto) => Promise.resolve({ _id: 's1', ...dto })),
    };

    notificationService = {
      sendNotification: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: getModelToken(Support.name), useValue: supportModel },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates support request and sends admin notification', async () => {
    const dto = {
      name: 'John Driver',
      email: 'john@driver.com',
      message: 'Need help with delivery route',
    };

    const result = await service.create(mockDriverPayload as any, dto);

    expect(supportModel.create).toHaveBeenCalledWith({
      ...dto,
      driverId: 'd1',
    });

    expect(notificationService.sendNotification).toHaveBeenCalledWith({
      recipientRole: Role.ADMIN,
      title: 'New Support Request',
      body: 'John Driver submitted a support request: "Need help with delivery route"',
      type: 'SUPPORT_REQUEST',
    });

    expect(result.message).toBe('Support request submitted successfully');
  });
});
