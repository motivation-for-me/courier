import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, ManifestItemStatus, ManifestStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { CreateManifestDto } from './dto/create-manifest.dto';

@Injectable()
export class ManifestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateManifestDto, actor: AuthenticatedUser) {
    this.require(actor, 'manifest:create');
    return this.prisma.manifest.create({ data: { ...input, organizationId: actor.organizationId } });
  }

  async addShipments(manifestId: string, consignmentIds: string[], actor: AuthenticatedUser) {
    this.require(actor, 'manifest:update');
    return this.prisma.$transaction(async (transaction) => {
      const manifest = await transaction.manifest.findFirst({ where: { id: manifestId, organizationId: actor.organizationId } });
      if (!manifest || manifest.status !== ManifestStatus.DRAFT) throw new BadRequestException('Manifest is not editable');
      const consignments = await transaction.consignment.findMany({ where: { id: { in: consignmentIds }, organizationId: actor.organizationId } });
      if (consignments.length !== consignmentIds.length) throw new BadRequestException('One or more consignments are outside your scope');
      if (consignments.some((item) => item.status !== ConsignmentStatus.VERIFIED)) throw new BadRequestException('Only verified consignments can be manifested');
      await transaction.manifestItem.createMany({ data: consignmentIds.map((consignmentId) => ({ manifestId, consignmentId })), skipDuplicates: true });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'manifest.shipments_added', entityType: 'manifest', entityId: manifestId, newValues: { consignmentIds } } });
      return transaction.manifest.findUnique({ where: { id: manifestId }, include: { items: true } });
    });
  }

  async seal(manifestId: string, actor: AuthenticatedUser) {
    this.require(actor, 'manifest:seal');
    return this.prisma.$transaction(async (transaction) => {
      const manifest = await transaction.manifest.findFirst({ where: { id: manifestId, organizationId: actor.organizationId }, include: { items: true } });
      if (!manifest || manifest.status !== ManifestStatus.DRAFT || !manifest.items.length) throw new BadRequestException('Manifest must be a non-empty draft');
      const updated = await transaction.manifest.update({ where: { id: manifestId }, data: { status: ManifestStatus.SEALED, sealedAt: new Date() } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'manifest.sealed', entityType: 'manifest', entityId: manifestId } });
      return updated;
    });
  }

  async dispatch(manifestId: string, actor: AuthenticatedUser) {
    this.require(actor, 'manifest:dispatch');
    return this.prisma.$transaction(async (transaction) => {
      const manifest = await transaction.manifest.findFirst({ where: { id: manifestId, organizationId: actor.organizationId }, include: { items: true } });
      if (!manifest || manifest.status !== ManifestStatus.SEALED) throw new BadRequestException('Only sealed manifests can be dispatched');
      for (const item of manifest.items) {
        await transaction.consignment.updateMany({ where: { id: item.consignmentId, status: ConsignmentStatus.VERIFIED }, data: { status: ConsignmentStatus.DISPATCHED, currentStatusAt: new Date() } });
        await transaction.trackingEvent.create({ data: { consignmentId: item.consignmentId, eventType: ConsignmentStatus.DISPATCHED, performedById: actor.id, remarks: `Dispatched on manifest ${manifest.manifestNumber}` } });
      }
      const updated = await transaction.manifest.update({ where: { id: manifestId }, data: { status: ManifestStatus.DISPATCHED, dispatchedAt: new Date() } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'manifest.dispatched', entityType: 'manifest', entityId: manifestId } });
      return updated;
    });
  }

  async receive(manifestId: string, receivedIds: string[], actor: AuthenticatedUser, remarks: string) {
    this.require(actor, 'manifest:receive');
    return this.prisma.$transaction(async (transaction) => {
      const manifest = await transaction.manifest.findFirst({ where: { id: manifestId, organizationId: actor.organizationId }, include: { items: true } });
      if (!manifest || manifest.status !== ManifestStatus.DISPATCHED) throw new BadRequestException('Only dispatched manifests can be received');
      const received = new Set(receivedIds);
      for (const item of manifest.items) {
        const status = received.has(item.consignmentId) ? ManifestItemStatus.RECEIVED : ManifestItemStatus.MISSING;
        await transaction.manifestItem.update({ where: { id: item.id }, data: { status, receivedAt: status === ManifestItemStatus.RECEIVED ? new Date() : null, discrepancy: status === ManifestItemStatus.MISSING ? 'Not scanned at destination' : null } });
        if (status === ManifestItemStatus.RECEIVED) {
          await transaction.consignment.updateMany({ where: { id: item.consignmentId, status: ConsignmentStatus.DISPATCHED }, data: { status: ConsignmentStatus.RECEIVED, currentStatusAt: new Date() } });
          await transaction.trackingEvent.create({ data: { consignmentId: item.consignmentId, eventType: ConsignmentStatus.RECEIVED, performedById: actor.id, remarks } });
        }
      }
      const updated = await transaction.manifest.update({ where: { id: manifestId }, data: { status: ManifestStatus.RECEIVED, receivedAt: new Date() } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'manifest.received', entityType: 'manifest', entityId: manifestId, newValues: { receivedIds, remarks } } });
      return updated;
    });
  }

  async reconcile(manifestId: string, actor: AuthenticatedUser) {
    this.require(actor, 'manifest:reconcile');
    const manifest = await this.prisma.manifest.findFirst({ where: { id: manifestId, organizationId: actor.organizationId }, include: { items: true } });
    if (!manifest || manifest.status !== ManifestStatus.RECEIVED) throw new BadRequestException('Manifest must be received before reconciliation');
    const updated = await this.prisma.manifest.update({ where: { id: manifestId }, data: { status: ManifestStatus.RECONCILED, reconciledAt: new Date() } });
    await this.prisma.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'manifest.reconciled', entityType: 'manifest', entityId: manifestId } });
    return { manifest: updated, expected: manifest.items.length, received: manifest.items.filter((item) => item.status === ManifestItemStatus.RECEIVED).length, missing: manifest.items.filter((item) => item.status === ManifestItemStatus.MISSING).length };
  }

  private require(actor: AuthenticatedUser, permission: string) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException('Manifest permission missing');
  }
}
