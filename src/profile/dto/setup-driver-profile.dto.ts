import { IsDateString, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

// This DTO is used with multipart/form-data (file upload).
// Because form-data sends ALL fields as strings, we use @Transform to coerce
// lat/lng from string → number before class-validator runs @IsNumber checks.
// The profile image file is handled separately via @UploadedFile() in the
// controller — no field here for it; the controller passes it in as a string path.
export class SetupDriverProfileDto {
  @IsNotEmpty()
  @IsString()
  driverId: string;

  @IsNotEmpty()
  @IsDateString()
  dateOfBirth: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNotEmpty()
  @Transform(({ value }) => parseFloat(value))
  @Min(-180)
  @Max(180)
  lng: number;

  @IsOptional()
  @IsString()
  address?: string;
}
