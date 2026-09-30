import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { CreateCustomerAddressDto, CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CreateProjectDto } from './dto/project.dto';
import { CreateShopUserDto } from './dto/shop-user.dto';

const shopPermissionCodes = ['shipment:create', 'shipment:view', 'customer:view', 'documents:view', 'documents:create'];

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  listCustomers(actor: AuthenticatedUser, search?: string) {
    return this.prisma.customer.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null, ...(actor.roles.includes('SHOP_MANAGER') ? { id: actor.customerId } : {}), ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { phone: { contains: search } }] } : {}) },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, email: true, phone: true, addresses: { orderBy: { label: 'asc' }, select: { id: true, label: true, addressLine: true, city: true, region: true, countryCode: true } }, _count: { select: { projects: true, consignments: true } } },
    });
  }

  async listShopUsers(customerId: string, actor: AuthenticatedUser) {
    this.admin(actor);
    await this.requireCustomer(customerId, actor);
    return this.prisma.user.findMany({ where: { organizationId: actor.organizationId, customerId, isActive: true, roles: { some: { role: { name: 'SHOP_MANAGER' } } } }, select: { id: true, displayName: true, email: true, phone: true, isActive: true, createdAt: true }, orderBy: { displayName: 'asc' } });
  }

  async createShopUser(customerId: string, input: CreateShopUserDto, actor: AuthenticatedUser) {
    this.admin(actor);
    await this.requireCustomer(customerId, actor);
    return this.prisma.$transaction(async (transaction) => {
      const email = input.email.trim().toLowerCase();
      if (await transaction.user.findUnique({ where: { organizationId_email: { organizationId: actor.organizationId, email } } })) throw new BadRequestException('A user with this email already exists');
      const permissions = await transaction.permission.findMany({ where: { organizationId: actor.organizationId, code: { in: shopPermissionCodes } } });
      if (permissions.length !== shopPermissionCodes.length) throw new BadRequestException('Shop permissions are not configured');
      const role = await transaction.role.upsert({ where: { organizationId_name: { organizationId: actor.organizationId, name: 'SHOP_MANAGER' } }, create: { organizationId: actor.organizationId, name: 'SHOP_MANAGER', description: 'Shop user restricted to the linked shop' }, update: {} });
      await transaction.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
      const user = await transaction.user.create({ data: { organizationId: actor.organizationId, customerId, displayName: input.displayName.trim(), email, phone: input.phone, passwordHash: await bcrypt.hash(input.password, 12), roles: { create: { organizationId: actor.organizationId, roleId: role.id } } }, select: { id: true, displayName: true, email: true, phone: true, customerId: true, isActive: true } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'shop.user.created', entityType: 'user', entityId: user.id, newValues: { customerId, email, role: 'SHOP_MANAGER' } } });
      await transaction.notification.create({ data: { organizationId: actor.organizationId, recipientId: user.id, channel: 'IN_APP', template: 'SHOP_ACCOUNT_CREATED', status: 'UNREAD', payload: { title: 'Shop account ready', message: 'You can now create and track shipments for your shop.' } } });
      return user;
    });
  }

  private async requireCustomer(customerId: string, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
    if (!customer) throw new NotFoundException('Shop not found');
    return customer;
  }

  private admin(actor: AuthenticatedUser) { if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator access required'); }

  async createCustomer(input: CreateCustomerDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.create({ data: { ...input, organizationId: actor.organizationId }, include: { addresses: true } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'customer.created', entityType: 'customer', entityId: customer.id, newValues: { name: customer.name } } });
      return customer;
    });
  }

  async updateCustomer(customerId: string, input: UpdateCustomerDto, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
    if (!customer) throw new NotFoundException('Shop not found');
    return this.prisma.customer.update({ where: { id: customerId }, data: { ...(input.name ? { name: input.name.trim() } : {}), ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() || null } : {}), ...(input.phone !== undefined ? { phone: input.phone || null } : {}) }, include: { addresses: true } });
  }

  async deleteCustomer(customerId: string, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true, name: true } });
    if (!customer) throw new NotFoundException('Shop not found');
    const deletedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: customerId }, data: { deletedAt } }),
      this.prisma.consignment.updateMany({ where: { customerId, deletedAt: null }, data: { deletedAt } }),
      this.prisma.project.updateMany({ where: { customerId, isActive: true }, data: { isActive: false } }),
      this.prisma.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'customer.deleted', entityType: 'customer', entityId: customerId, oldValues: { name: customer.name }, newValues: { deletedAt } } }),
    ]);
    return { success: true };
  }

  async createCustomerAddress(customerId: string, input: CreateCustomerAddressDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findFirst({ where: { id: customerId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true, addresses: { select: { id: true } } } });
      if (!customer) throw new NotFoundException('Shop not found');
      if (customer.addresses.length) throw new BadRequestException('A shop can have only one pickup branch');
      const address = await transaction.customerAddress.create({ data: { customerId, label: input.label.trim(), addressLine: input.addressLine.trim(), city: input.city?.trim() || null, region: input.region?.trim() || null, countryCode: input.countryCode?.trim().toUpperCase() || null } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'customer.branch.created', entityType: 'customerAddress', entityId: address.id, newValues: { customerId, label: address.label } } });
      return address;
    });
  }


  async saveCustomerAddress(customerId: string, input: CreateCustomerAddressDto, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true, addresses: { take: 1, select: { id: true } } } });
    if (!customer) throw new NotFoundException('Shop not found');
    const data = { label: input.label.trim(), addressLine: input.addressLine.trim(), city: input.city?.trim() || null, region: input.region?.trim() || null, countryCode: input.countryCode?.trim().toUpperCase() || null };
    return customer.addresses[0] ? this.prisma.customerAddress.update({ where: { id: customer.addresses[0].id }, data }) : this.prisma.customerAddress.create({ data: { customerId, ...data } });
  }

  listProjects(actor: AuthenticatedUser, customerId?: string, search?: string) {
    return this.prisma.project.findMany({
      where: { organizationId: actor.organizationId, isActive: true, ...(customerId ? { customerId } : {}), ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { siteName: { contains: search, mode: 'insensitive' as const } }, { addressLine: { contains: search, mode: 'insensitive' as const } }] } : {}) },
      orderBy: { name: 'asc' },
      take: 100,
      include: { customer: { select: { id: true, name: true } }, _count: { select: { consignments: true } } },
    });
  }

  async createProject(input: CreateProjectDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      if (input.customerId) {
        const customer = await transaction.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId }, select: { id: true } });
        if (!customer) throw new NotFoundException('Customer not found');
      }
      const normalizedCode = input.code?.trim().toUpperCase() || null;
      if (normalizedCode) {
        const duplicate = await transaction.project.findUnique({ where: { organizationId_code: { organizationId: actor.organizationId, code: normalizedCode } }, select: { id: true } });
        if (duplicate) throw new BadRequestException('Project code is already in use');
      }
      const project = await transaction.project.create({ data: { ...input, code: normalizedCode, countryCode: input.countryCode?.toUpperCase(), organizationId: actor.organizationId } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'project.created', entityType: 'project', entityId: project.id, newValues: { name: project.name, siteName: project.siteName } } });
      return project;
    });
  }
}
