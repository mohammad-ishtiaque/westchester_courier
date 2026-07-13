import { IsMongoId } from 'class-validator';

export class AssignDriverDto {
  @IsMongoId()
  driverId: string;
}
