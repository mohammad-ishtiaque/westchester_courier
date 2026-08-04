import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ProofOfDeliveryDto {
  @IsOptional()
  @IsString()
  proofOfDeliveryImage?: string;

  @IsString()
  @IsNotEmpty()
  recipientName: string;
}
