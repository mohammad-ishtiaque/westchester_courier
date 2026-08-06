import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findAll(
    @CurrentUser() user: TokenPayload,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const isUnreadOnly = unreadOnly === 'true' || unreadOnly === '1';
    return this.notificationService.findAllForUser(user, {
      unreadOnly: isUnreadOnly,
      page,
      limit,
    });
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: TokenPayload) {
    return this.notificationService.getUnreadCount(user);
  }

  @Patch('fcm-token')
  saveFcmToken(@CurrentUser() user: TokenPayload, @Body() dto: UpdateFcmTokenDto) {
    return this.notificationService.saveFcmToken(user, dto);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: TokenPayload) {
    return this.notificationService.markAllAsRead(user);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.notificationService.markAsRead(id, user);
  }
}
