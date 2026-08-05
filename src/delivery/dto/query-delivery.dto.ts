import { IsEnum, IsOptional, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryStatus } from '../../common/enums/delivery-status.enum';

// Query params for GET /deliveries (admin list) and GET /deliveries/my (driver list).
export class QueryDeliveryDto {
  @IsOptional() @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}
