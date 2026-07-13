import { IsOptional, IsString } from 'class-validator';

export class RejectDeliveryDto {
  @IsOptional() @IsString()
  reason?: string;
}
