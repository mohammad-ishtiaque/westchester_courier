import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotificationService } from './notification.service';
import { Notification } from './schemas/notification.schema';
import { User } from '../user/schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { Types } from 'mongoose';

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationModel: any;
  let userModel: any;

  const mockUserPayload = {
    authId: 'a1',
    userId: new Types.ObjectId().toHexString(),
    email: 'driver@test.com',
    role: Role.DRIVER,
  };

  const mockNotification = (overrides: Partial<any> = {}) => ({
    _id: 'n1',
    recipientId: mockUserPayload.userId,
    recipientRole: Role.DRIVER,
    title: 'New Assigned',
    body: 'You have been assigned a new delivery (Order WC-Q5MGTM).',
    type: 'NEW_ASSIGNMENT',
    isRead: false,
    createdAt: new Date(),
    toObject: jest.fn().mockReturnValue({
      _id: 'n1',
      recipientId: mockUserPayload.userId,
      recipientRole: Role.DRIVER,
      title: 'New Assigned',
      body: 'You have been assigned a new delivery (Order WC-Q5MGTM).',
      type: 'NEW_ASSIGNMENT',
      isRead: false,
      createdAt: new Date(),
      ...overrides,
    }),
  });

  beforeEach(async () => {
    notificationModel = {
      create: jest.fn().mockResolvedValue(mockNotification()),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockNotification()]),
      }),
      countDocuments: jest.fn().mockResolvedValue(1),
      findById: jest.fn().mockResolvedValue(mockNotification()),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    userModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      findById: jest.fn().mockResolvedValue({
        _id: mockUserPayload.userId,
        name: 'Test Driver',
        email: 'driver@test.com',
        fcmToken: 'test-fcm-token',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: getModelToken(Notification.name), useValue: notificationModel },
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('saves fcm token for user', async () => {
    const result = await service.saveFcmToken(mockUserPayload as any, { fcmToken: 'token123' });
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: mockUserPayload.userId },
      { $set: { fcmToken: 'token123' } },
    );
    expect(result.data.fcmToken).toBe('token123');
  });

  it('creates and sends notification', async () => {
    const result = await service.sendNotification({
      recipientId: mockUserPayload.userId,
      recipientRole: Role.DRIVER,
      title: 'New Assigned',
      body: 'You have been assigned a new delivery',
      type: 'NEW_ASSIGNMENT',
    });

    expect(notificationModel.create).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('fetches all notifications for user with section formatting', async () => {
    const result = await service.findAllForUser(mockUserPayload as any, { page: 1, limit: 10 });
    expect(result.data.length).toBe(1);
    expect(result.data[0].section).toBe('Today');
    expect(result.unreadCount).toBe(1);
  });

  it('gets unread count for user', async () => {
    const result = await service.getUnreadCount(mockUserPayload as any);
    expect(result.data.unreadCount).toBe(1);
  });

  it('marks notification as read', async () => {
    const doc = mockNotification();
    doc.save = jest.fn().mockResolvedValue(true);
    notificationModel.findById.mockResolvedValue(doc);

    const result = await service.markAsRead('n1', mockUserPayload as any);
    expect(doc.isRead).toBe(true);
    expect(result.message).toBe('Notification marked as read');
  });

  it('marks all notifications as read', async () => {
    const result = await service.markAllAsRead(mockUserPayload as any);
    expect(notificationModel.updateMany).toHaveBeenCalled();
    expect(result.message).toBe('All notifications marked as read');
  });
});
