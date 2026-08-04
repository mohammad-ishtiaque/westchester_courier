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

  @Prop()
  title?: string;

  @Prop()
  parcelType?: string;

  @Prop()
  weight?: string;

  // --- Customer Information ---
  @Prop({ required: true })
  customerName: string;

  @Prop()
  customerEmail?: string;

  @Prop({ required: true })
  customerPhone: string;

  // --- Pickup Details ---
  @Prop()
  pickupContact?: string;

  @Prop({ required: true })
  pickupAddress: string;

  @Prop()
  pickupDate?: Date;

  @Prop()
  preferrablePickupTime?: string;

  @Prop()
  pickupNote?: string;

  @Prop({ type: GeoPoint })
  pickupCoordinates?: GeoPoint;

  // --- Delivery / Receiver Details ---
  @Prop({ required: true })
  receiverName: string;

  @Prop({ required: true })
  receiverPhone: string;

  @Prop({ required: true })
  dropoffAddress: string;

  @Prop()
  preferrableDeliveryDate?: Date;

  @Prop()
  deliveryNote?: string;

  @Prop({ type: GeoPoint })
  dropoffCoordinates?: GeoPoint;

  @Prop()
  packageDescription?: string;

  @Prop({ type: String, enum: DeliveryStatus, default: DeliveryStatus.UNASSIGNED })
  status: DeliveryStatus;

  // The Driver's User document (role: DRIVER) — null until an admin assigns it.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedDriver?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Admin', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: GeoPoint })
  currentLocation?: GeoPoint;

  @Prop()
  rejectionReason?: string;

  @Prop()
  proofOfDeliveryImage?: string;

  @Prop()
  recipientName?: string;

  @Prop()
  deliveredAt?: Date;
}

export type DeliveryDocument = Delivery & Document;
export const DeliverySchema = SchemaFactory.createForClass(Delivery);
