import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

// Shared shape for both DRIVER/USER (User collection) and ADMIN/SUPER_ADMIN (Admin
// collection) profiles.
export class UpdateProfileDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  phoneNumber?: string;

  @IsOptional() @IsString()
  profileImage?: string;

  @IsOptional() @IsString()
  address?: string;

  @IsOptional() @IsString()
  driverId?: string;

  @IsOptional() @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? parseFloat(value) : undefined))
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? parseFloat(value) : undefined))
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}


