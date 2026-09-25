import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { MoveTransitDto } from './dto/move-transit.dto';
import { TransitService } from './transit.service';

@Controller('transit')
@UseGuards(AuthGuard)
export class TransitController {
  constructor(private readonly transit: TransitService) {}

  @Post(':consignmentId/move')
  @RequirePermission('transit:update')
  move(@Param('consignmentId') consignmentId: string, @Body() input: MoveTransitDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    return this.transit.move(consignmentId, input, actor, idempotencyKey);
  }
}
