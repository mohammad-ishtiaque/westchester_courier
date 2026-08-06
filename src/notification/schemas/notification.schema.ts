import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
  recipientId?: Types.ObjectId | null;

  @Prop({ type: String, enum: Role, required: true, index: true })
  recipientRole: Role;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ required: true })
  type: string;

  @Prop({ type: Types.ObjectId, ref: 'Delivery', required: false })
  deliveryId?: Types.ObjectId | null;

  @Prop({ required: false })
  orderNumber?: string;

  @Prop({ default: false, index: true })
  isRead: boolean;

  @Prop({ required: false })
  readAt?: Date;
}

export type NotificationDocument = Notification & Document;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientRole: 1, createdAt: -1 });
