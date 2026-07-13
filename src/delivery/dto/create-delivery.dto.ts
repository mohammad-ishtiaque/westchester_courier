import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDeliveryDto {
  @IsString() @IsNotEmpty()
  customerName: string;

  @IsString() @IsNotEmpty()
  customerPhone: string;

  @IsString() @IsNotEmpty()
  pickupAddress: string;

  @IsOptional() @IsNumber()
  pickupLng?: number;

  @IsOptional() @IsNumber()
  pickupLat?: number;

  @IsString() @IsNotEmpty()
  dropoffAddress: string;

  @IsOptional() @IsNumber()
  dropoffLng?: number;

  @IsOptional() @IsNumber()
  dropoffLat?: number;

  @IsOptional() @IsString()
  packageDescription?: string;
}
