import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { RegisterDocumentDto } from './dto/register-document.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(consignmentId: string, input: RegisterDocumentDto, actor: AuthenticatedUser) {
    if (!actor.permissions.includes('documents:create')) throw new ForbiddenException('Document create permission missing');
    if (input.type === DocumentType.PAYMENT_PROOF) throw new BadRequestException('Use the payment proof endpoint for payment documents');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(input.mimeType)) throw new BadRequestException('Unsupported document type');
    if (!input.storageKey || input.storageKey.includes('..') || input.storageKey.startsWith('/')) throw new BadRequestException('Invalid storage key');
    return this.prisma.$transaction(async (tx) => {
      const consignment = await tx.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId } });
      if (!consignment) throw new NotFoundException('Consignment not found');
      const document = await tx.document.create({ data: { organizationId: actor.organizationId, consignmentId, type: input.type, storageKey: input.storageKey, mimeType: input.mimeType, checksum: input.checksum, createdById: actor.id } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'document.registered', entityType: 'document', entityId: document.id, newValues: { type: input.type, consignmentId, sizeBytes: input.sizeBytes } } });
      return document;
    });
  }

  async listForConsignment(id: string, actor: AuthenticatedUser) {
    if (!actor.permissions.includes('documents:view')) throw new ForbiddenException('Document permission missing');
    const consignment = await this.prisma.consignment.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true } });
    if (!consignment) throw new NotFoundException('Consignment not found');
    return this.prisma.document.findMany({ where: { consignmentId: id, organizationId: actor.organizationId }, orderBy: { createdAt: 'desc' } });
  }

  async consignmentPdf(id: string, actor: AuthenticatedUser) {
    if (!actor.permissions.includes('documents:view')) throw new ForbiddenException('Document permission missing');
    const shipment = await this.prisma.consignment.findFirst({ where: { id, organizationId: actor.organizationId }, include: { parties: true, addresses: true, packages: true, events: { orderBy: { eventTime: 'asc' } }, payments: true } });
    if (!shipment) throw new NotFoundException('Consignment not found');
    const document = new PDFDocument({ margin: 48 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(chunk));
    const complete = new Promise<Buffer>((resolve) => document.on('end', () => resolve(Buffer.concat(chunks))));
    document.fontSize(20).text('SwiftLog OS - Consignment');
    document.moveDown().fontSize(12).text(`CN: ${shipment.cnNumber}`).text(`Status: ${shipment.status}`).text(`Service: ${shipment.serviceType}`);
    document.moveDown().text('Parties');
    shipment.parties.forEach((party) => document.text(`${party.kind}: ${party.name}${party.phone ? ` | ${party.phone}` : ''}`));
    document.moveDown().text('Tracking history');
    shipment.events.forEach((event) => document.text(`${event.eventTime.toISOString()}  ${event.eventType}  ${event.remarks ?? ''}`));
    document.moveDown().text(`Payment records: ${shipment.payments.length}`);
    document.end();
    return complete;
  }
}
