import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth.types';
import { CurrentUser } from '../../common/current-user.decorator';
import { RequirePermission } from '../../common/permissions.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { CreateCustomerAddressDto, CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CreateProjectDto } from './dto/project.dto';
import { CreateShopUserDto } from './dto/shop-user.dto';
import { CustomersService } from './customers.service';

@Controller()
@UseGuards(AuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('customers')
  @RequirePermission('customer:view')
  listCustomers(@CurrentUser() actor: AuthenticatedUser, @Query('search') search?: string) { return this.customers.listCustomers(actor, search); }

  @Post('customers')
  @RequirePermission('customer:create')
  createCustomer(@Body() input: CreateCustomerDto, @CurrentUser() actor: AuthenticatedUser) { return this.customers.createCustomer(input, actor); }

  @Get('customers/:customerId/users')
  @RequirePermission('user:view')
  listShopUsers(@Param('customerId') customerId: string, @CurrentUser() actor: AuthenticatedUser) { return this.customers.listShopUsers(customerId, actor); }

  @Post('customers/:customerId/users')
  @RequirePermission('user:view')
  createShopUser(@Param('customerId') customerId: string, @Body() input: CreateShopUserDto, @CurrentUser() actor: AuthenticatedUser) { return this.customers.createShopUser(customerId, input, actor); }

  @Patch('customers/:customerId')
  @RequirePermission('customer:create')
  updateCustomer(@Param('customerId') customerId: string, @Body() input: UpdateCustomerDto, @CurrentUser() actor: AuthenticatedUser) { return this.customers.updateCustomer(customerId, input, actor); }

  @Delete('customers/:customerId')
  @RequirePermission('customer:create')
  deleteCustomer(@Param('customerId') customerId: string, @CurrentUser() actor: AuthenticatedUser) { return this.customers.deleteCustomer(customerId, actor); }

  @Post('customers/:customerId/addresses')
  @RequirePermission('customer:create')
  createCustomerAddress(@Param('customerId') customerId: string, @Body() input: CreateCustomerAddressDto, @CurrentUser() actor: AuthenticatedUser) { return this.customers.createCustomerAddress(customerId, input, actor); }

  @Put('customers/:customerId/address')
  @RequirePermission('customer:create')
  saveCustomerAddress(@Param('customerId') customerId: string, @Body() input: CreateCustomerAddressDto, @CurrentUser() actor: AuthenticatedUser) { return this.customers.saveCustomerAddress(customerId, input, actor); }

  @Get('projects')
  @RequirePermission('project:view')
  listProjects(@CurrentUser() actor: AuthenticatedUser, @Query('customerId') customerId?: string, @Query('search') search?: string) { return this.customers.listProjects(actor, customerId, search); }

  @Post('projects')
  @RequirePermission('project:create')
  createProject(@Body() input: CreateProjectDto, @CurrentUser() actor: AuthenticatedUser) { return this.customers.createProject(input, actor); }
}
