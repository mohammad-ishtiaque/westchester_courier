import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { VehicleStatus } from '../../common/enums/vehicle-status.enum';

@Schema({ timestamps: true })
export class Vehicle {
  @Prop({ required: true })
  make: string;

  @Prop({ required: true })
  vehicleModelName: string;

  @Prop()
  year?: number;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  plateNumber: string;

  @Prop()
  vehicleType?: string; // e.g. "Van", "Motorcycle", "Car" — free text, not an enum, since
  // the Figma "Add Vehicle" form's exact option list wasn't extractable (see project notes)

  @Prop({ type: String, enum: VehicleStatus, default: VehicleStatus.ACTIVE })
  status: VehicleStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedDriver?: Types.ObjectId | null;
}

export type VehicleDocument = Vehicle & Document;
export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
