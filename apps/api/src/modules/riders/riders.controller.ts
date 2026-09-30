import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { CreateRiderDto, EnableMyRiderAccessDto, UpdateRiderDto } from './dto/create-rider.dto';
import { RidersService } from './riders.service';

@Controller('riders')
export class RidersController {
  constructor(private readonly riders: RidersService) {}

  @Get()
  @RequirePermission('user:view')
  list(@CurrentUser() actor: AuthenticatedUser) { return this.riders.list(actor); }

  @Get('recommendations/:consignmentId')
  @RequirePermission('delivery:assign')
  recommendations(@Param('consignmentId') consignmentId: string, @CurrentUser() actor: AuthenticatedUser) { return this.riders.recommendations(consignmentId, actor); }

  @Get('me/assignments')
  @RequirePermission('delivery:view')
  myAssignments(@CurrentUser() actor: AuthenticatedUser) { return this.riders.myAssignments(actor); }

  @Post('me')
  enableMe(@Body() input: EnableMyRiderAccessDto, @CurrentUser() actor: AuthenticatedUser) { return this.riders.enableCurrentAdmin(input.employeeCode, actor); }

  @Post()
  @RequirePermission('user:view')
  create(@Body() input: CreateRiderDto, @CurrentUser() actor: AuthenticatedUser) { return this.riders.create(input, actor); }

  @Patch(':id')
  @RequirePermission('user:view')
  update(@Param('id') id: string, @Body() input: UpdateRiderDto, @CurrentUser() actor: AuthenticatedUser) { return this.riders.update(id, input, actor); }

  @Delete(':id')
  @RequirePermission('user:view')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.riders.remove(id, actor); }
}
