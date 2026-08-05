import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum RequestTypeFilter {
  ALL = 'all',
  PENDING = 'pending',
  ACCEPTED = 'accepted',
}

export class GetDriverRequestsDto {
  @IsOptional()
  @IsEnum(RequestTypeFilter)
  type?: RequestTypeFilter = RequestTypeFilter.ALL;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
