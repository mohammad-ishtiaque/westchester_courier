import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Profile record for USER and DRIVER roles, linked back to its Auth credentials
// record via authId — mirrors the template's User.ts. Driver-specific fields
// (vehicle, license, current delivery, etc.) will be added when we build the
// Delivery/Driver module — kept minimal here on purpose since Auth is the only
// scope of this pass.
@Schema({ timestamps: true })
export class User {
  @Prop({ type: Types.ObjectId, ref: 'Auth', required: true })
  authId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  profile_image?: string;

  @Prop()
  phoneNumber?: string;

  @Prop()
  address?: string;

  @Prop({ default: false })
  isOnline: boolean;

  // Reverse reference kept in sync by VehicleService.assign — quick lookup without a
  // join, e.g. for the driver app's own "my vehicle" display.
  @Prop({ type: Types.ObjectId, ref: 'Vehicle', default: null })
  assignedVehicle?: Types.ObjectId | null;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
