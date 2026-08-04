import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';

// GeoJSON Point — same shape as the template's User.locationCoordinates, reused here
// for pickup/dropoff/live-location so all three support the same geo queries
// (e.g. "deliveries near this driver") if that's ever needed.
class GeoPoint {
  @Prop({ type: String, enum: ['Point'], default: 'Point' })
  type: string;

  @Prop({ type: [Number] }) // [longitude, latitude]
  coordinates: number[];
}

@Schema({ timestamps: true })
export class Delivery {
  // Human-readable order number shown in the admin table / driver app, separate from
  // Mongo's _id. Generated in the service (see generateOrderNumber in delivery.service.ts).
  @Prop({ required: true, unique: true })
  orderNumber: string;

  @Prop({ unique: true, sparse: true })
  trackingToken?: string;

  @Prop({ required: true })
  customerName: string;

  @Prop({ required: true })
  customerPhone: string;

  @Prop({ required: true })
  pickupAddress: string;

  @Prop({ type: GeoPoint })
  pickupCoordinates?: GeoPoint;

  @Prop({ required: true })
  dropoffAddress: string;

  @Prop({ type: GeoPoint })
  dropoffCoordinates?: GeoPoint;

  @Prop()
  packageDescription?: string;

  @Prop({ type: String, enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  // The Driver's User document (role: DRIVER) — null until an admin assigns it or a
  // driver claims it. Ref'd as 'User' since that's where Driver profiles live (see
  // AuthService.findProfile — DRIVER role routes to the User collection).
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedDriver?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Admin', required: true })
  createdBy: Types.ObjectId;

  // Updated by the driver app while a delivery is IN_TRANSIT — this is what the
  // admin Map screen and driver Map/tracking screens both read.
  @Prop({ type: GeoPoint })
  currentLocation?: GeoPoint;

  @Prop()
  rejectionReason?: string;

  // Proof of Delivery — matches the Figma "Proof of Delivery" screen (photo + recipient
  // name), populated only once, when status transitions to DELIVERED.
  @Prop()
  proofOfDeliveryImage?: string;

  @Prop()
  recipientName?: string;

  @Prop()
  deliveredAt?: Date;
}

export type DeliveryDocument = Delivery & Document;
export const DeliverySchema = SchemaFactory.createForClass(Delivery);
