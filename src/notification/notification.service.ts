import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { TokenPayload } from '../common/interfaces/token-payload.interface';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';

export interface SendNotificationPayload {
  recipientId?: string | Types.ObjectId | null;
  recipientRole: Role;
  title: string;
  body: string;
  type: string;
  deliveryId?: string | Types.ObjectId | null;
  orderNumber?: string;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async saveFcmToken(user: TokenPayload, dto: UpdateFcmTokenDto) {
    if (user.userId) {
      await this.userModel.updateOne(
        { _id: user.userId },
        { $set: { fcmToken: dto.fcmToken } },
      );
    }

    return {
      message: 'FCM token updated successfully',
      data: { fcmToken: dto.fcmToken },
    };
  }

  async sendNotification(payload: SendNotificationPayload) {
    const recipientObjId = payload.recipientId
      ? new Types.ObjectId(payload.recipientId.toString())
      : null;

    const deliveryObjId = payload.deliveryId
      ? new Types.ObjectId(payload.deliveryId.toString())
      : null;

    const notification = await this.notificationModel.create({
      recipientId: recipientObjId,
      recipientRole: payload.recipientRole,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      deliveryId: deliveryObjId,
      orderNumber: payload.orderNumber,
      isRead: false,
    });

    // Send FCM push notification asynchronously if recipient has an fcmToken
    if (recipientObjId) {
      this.sendFcmPush(recipientObjId, payload.title, payload.body, {
        type: payload.type,
        deliveryId: payload.deliveryId?.toString() || '',
        orderNumber: payload.orderNumber || '',
      }).catch((err) => {
        console.log(`[FCM Push Log] Could not deliver push: ${err?.message || err}`);
      });
    }

    return notification;
  }

  private async sendFcmPush(
    recipientId: Types.ObjectId,
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    const user = await this.userModel.findById(recipientId);
    if (!user || !user.fcmToken) {
      return;
    }

    // FCM Server Key or Firebase Admin API mock / integration logic
    const fcmServerKey = process.env.FCM_SERVER_KEY;
    if (!fcmServerKey) {
      console.log(`[FCM Push Simulated] To ${user.name} (${user.email}) -> Title: "${title}", Body: "${body}" [FCM Token: ${user.fcmToken}]`);
      return;
    }

    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${fcmServerKey}`,
        },
        body: JSON.stringify({
          to: user.fcmToken,
          notification: { title, body },
          data,
          priority: 'high',
        }),
      });

      const resData = await response.json();
      console.log(`[FCM Push Response] Result:`, resData);
    } catch (err: any) {
      console.log(`[FCM Push Error] ${err?.message || err}`);
    }
  }

  async findAllForUser(
    user: TokenPayload,
    query: { unreadOnly?: boolean; page?: number; limit?: number },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const userObjId = user.userId ? new Types.ObjectId(user.userId) : null;

    const filter: Record<string, unknown> = {
      $or: [
        { recipientId: userObjId },
        { recipientRole: user.role, recipientId: null },
      ],
    };

    if (query.unreadOnly) {
      filter.isRead = false;
    }

    const [items, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({ ...filter, isRead: false }),
    ]);

    const formattedData = items.map((item) => {
      const obj = item.toObject() as any;
      return {
        _id: obj._id,
        title: obj.title,
        body: obj.body,
        type: obj.type,
        orderNumber: obj.orderNumber || null,
        deliveryId: obj.deliveryId || null,
        isRead: obj.isRead,
        readAt: obj.readAt || null,
        section: this.getSectionLabel(obj.createdAt),
        timeAgo: this.getTimeAgo(obj.createdAt),
        createdAt: obj.createdAt,
      };
    });

    return {
      message: 'Notifications fetched successfully',
      unreadCount,
      data: formattedData,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount(user: TokenPayload) {
    const userObjId = user.userId ? new Types.ObjectId(user.userId) : null;
    const filter = {
      $or: [
        { recipientId: userObjId },
        { recipientRole: user.role, recipientId: null },
      ],
      isRead: false,
    };

    const unreadCount = await this.notificationModel.countDocuments(filter);
    return {
      message: 'Unread count fetched successfully',
      data: { unreadCount },
    };
  }

  async markAsRead(id: string, user: TokenPayload) {
    const notification = await this.notificationModel.findById(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    return {
      message: 'Notification marked as read',
      data: notification,
    };
  }

  async markAllAsRead(user: TokenPayload) {
    const userObjId = user.userId ? new Types.ObjectId(user.userId) : null;
    const filter = {
      $or: [
        { recipientId: userObjId },
        { recipientRole: user.role, recipientId: null },
      ],
      isRead: false,
    };

    await this.notificationModel.updateMany(filter, {
      $set: { isRead: true, readAt: new Date() },
    });

    return {
      message: 'All notifications marked as read',
    };
  }

  private getSectionLabel(date: Date): string {
    const now = new Date();
    const target = new Date(date);

    const isToday =
      now.getDate() === target.getDate() &&
      now.getMonth() === target.getMonth() &&
      now.getFullYear() === target.getFullYear();

    if (isToday) return 'Today';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      yesterday.getDate() === target.getDate() &&
      yesterday.getMonth() === target.getMonth() &&
      yesterday.getFullYear() === target.getFullYear();

    if (isYesterday) return 'Yesterday';

    return 'Earlier';
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }
}
