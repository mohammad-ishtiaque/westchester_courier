import { IsString, MinLength } from 'class-validator';

export class UpsertContentDto {
  @IsString()
  @MinLength(1)
  description: string;
}
