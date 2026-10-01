import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { AssignPickupDto, FailPickupDto } from './dto/pickup.dto';
import { PickupsService } from './pickups.service';

@Controller('pickups')
@UseGuards(AuthGuard)
export class PickupsController {
  constructor(private readonly pickups: PickupsService) {}

  @Get('assigned')
  @RequirePermission('pickup:view')
  assigned(@CurrentUser() actor: AuthenticatedUser) { return this.pickups.assigned(actor); }

  @Post('consignments/:consignmentId')
  @RequirePermission('pickup:create')
  request(@Param('consignmentId') consignmentId: string, @CurrentUser() actor: AuthenticatedUser) { return this.pickups.request(consignmentId, actor); }

  @Post(':id/assign')
  @RequirePermission('pickup:assign')
  assign(@Param('id') id: string, @Body() input: AssignPickupDto, @CurrentUser() actor: AuthenticatedUser) { return this.pickups.assign(id, input.assigneeId, actor, input.remarks); }

  @Post(':id/start')
  @RequirePermission('pickup:update')
  start(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.pickups.start(id, actor); }

  @Post(':id/complete')
  @RequirePermission('pickup:update')
  complete(@Param('id') id: string, @Body('remarks') remarks: string | undefined, @CurrentUser() actor: AuthenticatedUser) { return this.pickups.complete(id, actor, remarks); }

  @Post(':id/fail')
  @RequirePermission('pickup:update')
  fail(@Param('id') id: string, @Body() input: FailPickupDto, @CurrentUser() actor: AuthenticatedUser) { return this.pickups.fail(id, actor, input.reason); }
}
