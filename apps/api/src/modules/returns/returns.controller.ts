import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { CreateReturnDto } from './dto/return.dto';
import { ReturnsService } from './returns.service';

@Controller('returns')
@UseGuards(AuthGuard)
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post(':consignmentId')
  @RequirePermission('return:create')
  create(@Param('consignmentId') consignmentId: string, @Body() input: CreateReturnDto, @CurrentUser() actor: AuthenticatedUser) { return this.returns.create(consignmentId, input.reason, actor); }
}
