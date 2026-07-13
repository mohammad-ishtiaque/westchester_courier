import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsString() make: string;
  @IsString() vehicleModelName: string;
  @IsOptional() @IsInt() @Min(1980) @Max(2100) year?: number;
  @IsString() plateNumber: string;
  @IsOptional() @IsString() vehicleType?: string;
}
