import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Profile record for ADMIN / SUPER_ADMIN roles — mirrors the template's Admin.ts.
@Schema({ timestamps: true })
export class Admin {
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
}

export type AdminDocument = Admin & Document;
export const AdminSchema = SchemaFactory.createForClass(Admin);
