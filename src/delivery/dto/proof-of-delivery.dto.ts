import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ProofOfDeliveryDto {
  @IsOptional()
  @IsString()
  proofOfDeliveryImage?: string;

  @IsOptional()
  @IsString()
  recipientSignatureImage?: string;

  @IsString()
  @IsNotEmpty()
  recipientName: string;
}
