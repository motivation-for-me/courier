import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';
@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}
  list(actor: AuthenticatedUser) { return this.prisma.branch.findMany({ where: { organizationId: actor.organizationId, ...(actor.branchId ? { id: actor.branchId } : {}) }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }); }
  async create(input: CreateBranchDto, actor: AuthenticatedUser) { if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator access required'); const code = input.code.trim().toUpperCase(); if (await this.prisma.branch.findUnique({ where: { organizationId_code: { organizationId: actor.organizationId, code } } })) throw new BadRequestException('Branch code already exists'); return this.prisma.branch.create({ data: { organizationId: actor.organizationId, code, name: input.name.trim() } }); }
  async update(id: string, input: UpdateBranchDto, actor: AuthenticatedUser) { this.admin(actor); const branch = await this.prisma.branch.findFirst({ where: { id, organizationId: actor.organizationId } }); if (!branch) throw new NotFoundException('Courier branch not found'); const code = input.code?.trim().toUpperCase(); if (code && code !== branch.code && await this.prisma.branch.findUnique({ where: { organizationId_code: { organizationId: actor.organizationId, code } } })) throw new BadRequestException('Branch code already exists'); return this.prisma.branch.update({ where: { id }, data: { ...(input.name ? { name: input.name.trim() } : {}), ...(code ? { code } : {}) } }); }
  async remove(id: string, actor: AuthenticatedUser) { this.admin(actor); const branch = await this.prisma.branch.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true, _count: { select: { users: true, riders: true, consignments: true } } } }); if (!branch) throw new NotFoundException('Courier branch not found'); if (branch._count.users || branch._count.riders || branch._count.consignments) throw new BadRequestException('Branch is in use and cannot be deleted'); await this.prisma.branch.delete({ where: { id } }); return { success: true }; }
  private admin(actor: AuthenticatedUser) { if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator access required'); }
}
