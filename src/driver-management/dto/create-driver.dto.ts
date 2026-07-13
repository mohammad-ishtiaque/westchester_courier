import { IsEmail, IsString, MinLength } from 'class-validator';

// Admin-initiated driver creation — distinct from AuthService.register because an
// admin creating a driver account vouches for them directly (no email OTP dance);
// the account is created already active. Matches the Figma "Add Driver" form.
export class CreateDriverDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() phoneNumber?: string;
}
