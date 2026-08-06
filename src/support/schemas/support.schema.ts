import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SupportStatus } from '../../common/enums/support-status.enum';

export type SupportDocument = Support & Document;

@Schema({ timestamps: true })
export class Support {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  driverId: Types.ObjectId;

  @Prop({ type: String, enum: SupportStatus, default: SupportStatus.PENDING })
  status: SupportStatus;
}

export const SupportSchema = SchemaFactory.createForClass(Support);
