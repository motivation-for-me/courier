import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';
@Controller('branches')
export class BranchesController { constructor(private readonly branches: BranchesService) {} @Get() @RequirePermission('route:view') list(@CurrentUser() actor: AuthenticatedUser) { return this.branches.list(actor); } @Post() @RequirePermission('route:view') create(@Body() input: CreateBranchDto, @CurrentUser() actor: AuthenticatedUser) { return this.branches.create(input, actor); } @Patch(':id') @RequirePermission('route:view') update(@Param('id') id: string, @Body() input: UpdateBranchDto, @CurrentUser() actor: AuthenticatedUser) { return this.branches.update(id, input, actor); } @Delete(':id') @RequirePermission('route:view') remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.branches.remove(id, actor); } }
