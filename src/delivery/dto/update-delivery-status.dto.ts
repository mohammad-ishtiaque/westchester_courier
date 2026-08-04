import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus)
  @IsNotEmpty()
  status: DeliveryStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  proofOfDeliveryImage?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;
}
