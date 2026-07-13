import { IsLatitude, IsLongitude } from 'class-validator';

export class UpdateLocationDto {
  @IsLongitude()
  lng: number;

  @IsLatitude()
  lat: number;
}
