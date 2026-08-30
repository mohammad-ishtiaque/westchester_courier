import { Body, Controller, Delete, Get, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProfileService } from './profile.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetupDriverProfileDto } from './dto/setup-driver-profile.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { buildDiskStorage, imageFileFilter } from '../common/utils/upload.util';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@CurrentUser() user: TokenPayload) {
    return this.profileService.getMe(user);
  }

  @Roles(Role.DRIVER)
  @Patch('driver-setup')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: buildDiskStorage('profile-images'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  setupDriverProfile(
    @CurrentUser() user: TokenPayload,
    @Body() dto: SetupDriverProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const profileImagePath = file ? file.path.replace(/\\/g, '/') : undefined;
    return this.profileService.setupDriverProfile(user, dto, profileImagePath);
  }

  @Patch('me')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: buildDiskStorage('profile-images'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
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

  @Delete('me')
  deleteMe(@CurrentUser() user: TokenPayload, @Body() dto: DeleteAccountDto) {
    return this.profileService.deleteMe(user, dto);
  }
}

