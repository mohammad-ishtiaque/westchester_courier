import { IsEmail, IsString, Length } from 'class-validator';

export class ActivateAccountDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Activation code must be 6 digits' })
  activationCode: string;
}
