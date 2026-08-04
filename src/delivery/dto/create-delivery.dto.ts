import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDeliveryDto {
  @IsOptional() @IsString()
  title?: string;

  @IsOptional() @IsString()
  parcelType?: string;

  @IsOptional() @IsString()
  weight?: string;

  // --- Step 1: Customer Information ---
  @IsString() @IsNotEmpty()
  customerName: string;

  @IsOptional() @IsEmail()
  customerEmail?: string;

  @IsString() @IsNotEmpty()
  customerPhone: string;

  // --- Step 2: Pickup Details ---
  @IsOptional() @IsString()
  pickupContact?: string;

  @IsString() @IsNotEmpty()
  pickupAddress: string;

  @IsOptional() @IsString()
  pickupDate?: string;

  @IsOptional() @IsString()
  preferrablePickupTime?: string;

  @IsOptional() @IsString()
  pickupNote?: string;

  @IsOptional() @IsNumber()
  pickupLng?: number;

  @IsOptional() @IsNumber()
  pickupLat?: number;

  // --- Step 3: Delivery Details ---
  @IsOptional() @IsString()
  receiverName?: string;

  @IsOptional() @IsString()
  receiverPhone?: string;

  @IsString() @IsNotEmpty()
  dropoffAddress: string;

  @IsOptional() @IsString()
  preferrableDeliveryDate?: string;

  @IsOptional() @IsString()
  deliveryNote?: string;

  @IsOptional() @IsNumber()
  dropoffLng?: number;

  @IsOptional() @IsNumber()
  dropoffLat?: number;

  @IsOptional() @IsString()
  packageDescription?: string;

  @IsOptional() @IsString()
  driverId?: string;
}

