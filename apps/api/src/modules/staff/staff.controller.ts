import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { CreateStaffDto, UpdateStaffAccessDto, UpdateStaffDto } from './dto/create-staff.dto';
import { StaffService } from './staff.service';
@Controller('staff') export class StaffController {
  constructor(private readonly staff: StaffService) {}
  @Get() @RequirePermission('user:view') list(@CurrentUser() actor: AuthenticatedUser) { return this.staff.list(actor); }
  @Get('access-options') @RequirePermission('user:view') accessOptions(@CurrentUser() actor: AuthenticatedUser) { return this.staff.accessOptions(actor); }
  @Post() @RequirePermission('user:view') create(@Body() input: CreateStaffDto, @CurrentUser() actor: AuthenticatedUser) { return this.staff.create(input, actor); }
  @Patch(':id') @RequirePermission('user:view') update(@Param('id') id: string, @Body() input: UpdateStaffDto, @CurrentUser() actor: AuthenticatedUser) { return this.staff.update(id, input, actor); }
  @Patch(':id/access') @RequirePermission('user:view') updateAccess(@Param('id') id: string, @Body() input: UpdateStaffAccessDto, @CurrentUser() actor: AuthenticatedUser) { return this.staff.updateAccess(id, input, actor); }
  @Delete(':id') @RequirePermission('user:view') remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.staff.remove(id, actor); }
}
