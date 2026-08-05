import { IsNotEmpty, IsMongoId, IsString, IsOptional } from 'class-validator';

export class CreateReportDto {
  @IsMongoId()
  @IsNotEmpty()
  deliveryId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  photo?: string;
}
