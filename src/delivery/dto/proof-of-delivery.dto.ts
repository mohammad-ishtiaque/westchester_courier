import { IsNotEmpty, IsString } from 'class-validator';

export class ProofOfDeliveryDto {
  @IsString() @IsNotEmpty()
  proofOfDeliveryImage: string; // URL — file upload handling comes with a future Uploads module

  @IsString() @IsNotEmpty()
  recipientName: string;
}
