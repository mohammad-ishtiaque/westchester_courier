import { IsOptional, IsString } from 'class-validator';

export class UpdateDriverDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsString() address?: string;
}
