import { IsMongoId } from 'class-validator';

export class AssignVehicleDto {
  @IsMongoId()
  driverId: string;
}
