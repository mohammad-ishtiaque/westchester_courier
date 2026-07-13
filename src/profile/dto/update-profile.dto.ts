import { IsOptional, IsString, IsUrl } from 'class-validator';

// Shared shape for both DRIVER/USER (User collection) and ADMIN/SUPER_ADMIN (Admin
// collection) profiles — covers the fields both schemas have in common. Fields only
// one side has (e.g. User.isOnline, User.locationCoordinates) are managed by their
// own dedicated endpoints (isOnline by the Delivery/presence flow, location by
// Delivery's updateLocation) rather than this general-purpose profile update.
export class UpdateProfileDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  phoneNumber?: string;

  @IsOptional() @IsUrl()
  profileImage?: string;

  @IsOptional() @IsString()
  address?: string;
}
