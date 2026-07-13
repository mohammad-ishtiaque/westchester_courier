import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Generic singleton-content schema, reused across five named collections (Terms &
// Conditions, Privacy Policy, About Us, FAQ, Contact Us) — mirrors the Express
// reference template's Manage.ts, which used one shared `descriptionSchema` for all
// five. Each collection holds at most one document at a time (see CmsService.upsert).
@Schema({ timestamps: true })
export class Content {
  @Prop({ required: true })
  description: string;
}

export type ContentDocument = Content & Document;
export const ContentSchema = SchemaFactory.createForClass(Content);
