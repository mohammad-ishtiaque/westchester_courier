import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { CallbackWithoutResultAndOptionalError, Document } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Role } from '../../common/enums/role.enum';

// Direct port of the template's Auth.ts. Credentials + account-state live here,
// separate from the profile (User/Admin) — same "two collections tied by authId"
// pattern explained in the crash course doc.
@Schema({ timestamps: true })
export class Auth {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: String, required: true, enum: Role })
  role: Role;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: false })
  isBlocked: boolean;

  @Prop({ default: false })
  isActive: boolean;

  @Prop()
  verificationCode?: string;

  @Prop()
  verificationCodeExpire?: Date;

  @Prop()
  activationCode?: string;

  @Prop()
  activationCodeExpire?: Date;
}

export type AuthDocument = Auth & Document;
export const AuthSchema = SchemaFactory.createForClass(Auth);

// Same bcrypt pre-save hook as the template — hash the password only when it's
// actually being set/changed, not on every save.
AuthSchema.pre('save', async function (this: AuthDocument, next: CallbackWithoutResultAndOptionalError) {
  if (!this.isModified('password')) return next;
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);
  this.password = await bcrypt.hash(this.password, saltRounds);
  next;
});
