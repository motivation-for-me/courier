import { Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) { return this.notifications.list(actor); }

  @Patch(':id/read')
  read(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.notifications.read(id, actor); }

  @Patch('read-all')
  readAll(@CurrentUser() actor: AuthenticatedUser) { return this.notifications.readAll(actor); }
}
