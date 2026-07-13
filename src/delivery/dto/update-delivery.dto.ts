import { PartialType } from '@nestjs/mapped-types';
import { CreateDeliveryDto } from './create-delivery.dto';

// Admin-only edit of a delivery still in PENDING — every field optional.
export class UpdateDeliveryDto extends PartialType(CreateDeliveryDto) {}
