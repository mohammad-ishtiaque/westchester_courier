import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';

// No @Roles() here on purpose — every authenticated role (DRIVER, USER, ADMIN,
// SUPER_ADMIN) has a profile and can view/edit their own. The global JwtAuthGuard
// still applies (nothing here is @Public()).
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@CurrentUser() user: TokenPayload) {
    return this.profileService.getMe(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: TokenPayload, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateMe(user, dto);
  }
}
