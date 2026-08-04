import { Body, Controller, Get, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProfileService } from './profile.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetupDriverProfileDto } from './dto/setup-driver-profile.dto';
import { buildDiskStorage, imageFileFilter } from '../common/utils/upload.util';

// No global @Roles() here on purpose — every authenticated role (DRIVER, USER, ADMIN,
// SUPER_ADMIN) has a profile and can view/edit their own. The global JwtAuthGuard
// still applies (nothing here is @Public()).
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@CurrentUser() user: TokenPayload) {
    return this.profileService.getMe(user);
  }

  // Accepts multipart/form-data so the driver can upload their profile image as a file.
  // All text fields (driverId, dateOfBirth, phoneNumber, lat, lng, address) are sent
  // as regular form fields alongside the file. lat/lng are coerced from string → number
  // in the DTO via @Transform before class-validator runs.
  // The uploaded file is written to uploads/profile-images/ on disk; its relative path
  // is stored in MongoDB as a string (e.g. "uploads/profile-images/1722000000-123.jpg").
  @Roles(Role.DRIVER)
  @Patch('driver-setup')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: buildDiskStorage('profile-images'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
    }),
  )
  setupDriverProfile(
    @CurrentUser() user: TokenPayload,
    @Body() dto: SetupDriverProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // Convert the multer file to a portable path string for MongoDB.
    // Replace backslashes (Windows) so the stored value is always forward-slash.
    const profileImagePath = file ? file.path.replace(/\\/g, '/') : undefined;
    return this.profileService.setupDriverProfile(user, dto, profileImagePath);
  }

  @Patch('me')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: buildDiskStorage('profile-images'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
    }),
  )
  updateMe(
    @CurrentUser() user: TokenPayload,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const profileImagePath = file ? file.path.replace(/\\/g, '/') : undefined;
    return this.profileService.updateMe(user, dto, profileImagePath);
  }
}


