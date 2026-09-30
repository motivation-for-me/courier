import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import PDFDocument = require('pdfkit');
import * as QRCode from 'qrcode';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { RegisterDocumentDto } from './dto/register-document.dto';
import { createPublicTrackingToken } from '../../common/public-tracking-token';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(consignmentId: string, input: RegisterDocumentDto, actor: AuthenticatedUser) {
    if (!actor.permissions.includes('documents:create')) throw new ForbiddenException('Document create permission missing');
    if (input.type === DocumentType.PAYMENT_PROOF) throw new BadRequestException('Use the payment proof endpoint for payment documents');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(input.mimeType)) throw new BadRequestException('Unsupported document type');
    if (!input.storageKey || input.storageKey.includes('..') || input.storageKey.startsWith('/')) throw new BadRequestException('Invalid storage key');
    return this.prisma.$transaction(async (tx) => {
      const consignment = await tx.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId, deletedAt: null, ...(actor.roles.includes('SHOP_MANAGER') ? { customerId: actor.customerId } : {}) } });
      if (!consignment) throw new NotFoundException('Consignment not found');
      const document = await tx.document.create({ data: { organizationId: actor.organizationId, consignmentId, type: input.type, storageKey: input.storageKey, mimeType: input.mimeType, checksum: input.checksum, createdById: actor.id } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'document.registered', entityType: 'document', entityId: document.id, newValues: { type: input.type, consignmentId, sizeBytes: input.sizeBytes } } });
      return document;
    });
  }

  async listForConsignment(id: string, actor: AuthenticatedUser) {
    if (!actor.permissions.includes('documents:view')) throw new ForbiddenException('Document permission missing');
    const consignment = await this.prisma.consignment.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null, ...(actor.roles.includes('SHOP_MANAGER') ? { customerId: actor.customerId } : {}) }, select: { id: true } });
    if (!consignment) throw new NotFoundException('Consignment not found');
    return this.prisma.document.findMany({ where: { consignmentId: id, organizationId: actor.organizationId }, orderBy: { createdAt: 'desc' } });
  }

  async consignmentPdf(id: string, actor: AuthenticatedUser) {
    await this.assertCanView(id, actor);
    const shipment = await this.loadDispatch(id, actor);
    if (!shipment) throw new NotFoundException('Consignment not found');
    const scanUrl = `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/track/${encodeURIComponent(shipment.cnNumber)}?key=${createPublicTrackingToken(shipment.id)}`;
    const qr = await QRCode.toBuffer(scanUrl, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
    const document = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `SwiftLog Dispatch ${shipment.cnNumber}`, Author: shipment.organization.name } });
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(chunk));
    const complete = new Promise<Buffer>((resolve) => document.on('end', () => resolve(Buffer.concat(chunks))));
    const sender = shipment.parties.find((party) => party.kind === 'SENDER');
    const receiver = shipment.parties.find((party) => party.kind === 'RECEIVER');
    const origin = shipment.addresses.find((address) => address.kind === 'ORIGIN');
    const destination = shipment.addresses.find((address) => address.kind === 'DESTINATION');
    const assignment = shipment.assignments[0];
    document.rect(0, 0, 595, 92).fill('#16263b');
    document.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text('SWIFTLOG', 42, 28).fontSize(10).font('Helvetica').text('PROFESSIONAL DISPATCH RECORD', 42, 59);
    document.fontSize(10).text(shipment.organization.name, 360, 31, { width: 190, align: 'right' }).text(`Created ${shipment.createdAt.toLocaleString()}`, 360, 50, { width: 190, align: 'right' });
    document.fillColor('#0b1c30').font('Helvetica-Bold').fontSize(19).text(shipment.cnNumber, 42, 112);
    document.fontSize(10).fillColor('#5a6478').text(`STATUS  ${shipment.status.replaceAll('_', ' ')}`, 42, 140).text(`TYPE  ${shipment.serviceType}`, 250, 140);
    document.image(qr, 438, 106, { width: 112, height: 112 });
    document.fillColor('#5a6478').font('Helvetica').fontSize(9).text('Scan for secure live tracking', 42, 172).text(scanUrl, 42, 189, { width: 370, ellipsis: true });
    let y = 230;
    const section = (title: string) => { document.fillColor('#e8edf5').rect(42, y, 508, 22).fill(); document.fillColor('#16263b').font('Helvetica-Bold').fontSize(10).text(title, 50, y + 6); y += 32; };
    const pair = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => { document.fillColor('#5a6478').font('Helvetica-Bold').fontSize(8).text(leftLabel, 42, y).text(rightLabel, 302, y); document.fillColor('#0b1c30').font('Helvetica').fontSize(10).text(leftValue || '—', 42, y + 12, { width: 235 }).text(rightValue || '—', 302, y + 12, { width: 248 }); y += 42; };
    section('SENDER & RECEIVER');
    pair('SENDER', sender?.name ?? '—', 'RECEIVER', receiver?.name ?? '—');
    pair('PICKUP ADDRESS', origin?.addressLine ?? '—', 'DELIVERY ADDRESS', destination?.addressLine ?? '—');
    pair('SENDER PHONE', sender?.phone ?? '—', 'RECEIVER PHONE', receiver?.phone ?? '—');
    if (destination?.deliveryNote) { document.fillColor('#5a6478').font('Helvetica-Bold').fontSize(8).text('DELIVERY INSTRUCTIONS', 42, y); document.fillColor('#0b1c30').font('Helvetica').fontSize(10).text(destination.deliveryNote, 42, y + 12, { width: 508 }); y += 38; }
    section('PARCEL CONTENTS');
    document.fillColor('#5a6478').font('Helvetica-Bold').fontSize(8).text('DESCRIPTION', 50, y).text('SKU', 340, y).text('QTY', 430, y).text('UNIT', 490, y); y += 17;
    shipment.items.forEach((item, index) => { if (y > 720) { document.addPage(); y = 50; } if (index % 2 === 0) document.fillColor('#f7f9fc').rect(42, y - 5, 508, 24).fill(); document.fillColor('#0b1c30').font('Helvetica').fontSize(9).text(item.description, 50, y, { width: 275 }).text(item.sku ?? '—', 340, y).text(String(item.quantity), 430, y).text(item.unit, 490, y); y += 25; });
    y += 8; section('DELIVERY & PAYMENT');
    const payment = shipment.payments[0];
    pair('ASSIGNED RIDER', assignment?.rider.user.displayName ?? 'Not assigned', 'RIDER CONTACT', assignment?.rider.user.phone ?? 'Not available');
    pair('PAYMENT', payment ? `${payment.method} ${payment.amount} ${payment.currencyCode} · ${payment.status}` : 'No collection', 'SERVICE', shipment.serviceType.replaceAll('_', ' '));
    document.fillColor('#5a6478').fontSize(8).text('Scan the QR for secure live tracking. Use the printed CN for manual search or support.', 42, 780, { width: 508, align: 'center' });
    document.end();
    const buffer = await complete;
    await this.auditDownload(shipment.organizationId, shipment.id, actor, 'dispatch.pdf');
    return { buffer, filename: `${shipment.cnNumber}-dispatch.pdf` };
  }

  async labelPdf(id: string, actor: AuthenticatedUser) {
    await this.assertCanView(id, actor);
    const shipment = await this.loadDispatch(id, actor);
    if (!shipment) throw new NotFoundException('Dispatch not found');
    const scanUrl = `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/track/${encodeURIComponent(shipment.cnNumber)}?key=${createPublicTrackingToken(shipment.id)}`;
    const qr = await QRCode.toBuffer(scanUrl, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
    const document = new PDFDocument({ size: [432, 288], margin: 22 });
    const chunks: Buffer[] = []; document.on('data', (chunk) => chunks.push(chunk)); const complete = new Promise<Buffer>((resolve) => document.on('end', () => resolve(Buffer.concat(chunks))));
    const receiver = shipment.parties.find((party) => party.kind === 'RECEIVER');
    const destination = shipment.addresses.find((address) => address.kind === 'DESTINATION');
    const payment = shipment.payments[0];
    document.font('Helvetica-Bold').fontSize(18).fillColor('#16263b').text('SWIFTLOG');
    document.fillColor('#d44712').fontSize(9).text(shipment.serviceType.replaceAll('_', ' '), 22, 25, { width: 260, align: 'right' });
    document.fillColor('#16263b').fontSize(15).text(shipment.cnNumber, 22, 49);
    document.font('Helvetica').fillColor('#5a6478').fontSize(8).text('SCAN FOR LIVE TRACKING', 300, 22, { width: 110, align: 'center' });
    document.image(qr, 306, 36, { width: 98, height: 98 });
    document.moveTo(22, 78).lineTo(286, 78).strokeColor('#d9e2ef').stroke();
    document.fillColor('#5a6478').font('Helvetica-Bold').fontSize(8).text('DELIVER TO', 22, 91);
    document.fillColor('#0b1c30').fontSize(14).text(receiver?.name ?? 'Receiver', 22, 106);
    document.font('Helvetica').fontSize(10).text(receiver?.phone ?? 'Contact not provided', 22, 126);
    document.fontSize(10).text(`${destination?.addressLine ?? 'Address not provided'}${destination?.city ? `, ${destination.city}` : ''}`, 22, 145, { width: 270, height: 36 });
    if (destination?.landmark) document.fillColor('#5a6478').fontSize(8).text(`LANDMARK  ${destination.landmark}`, 22, 184, { width: 270 });
    if (destination?.deliveryNote) document.fillColor('#5a6478').fontSize(8).text(`NOTE  ${destination.deliveryNote}`, 22, 199, { width: 270, height: 24 });
    document.fillColor('#f3f6fa').rect(300, 148, 110, 91).fill();
    document.fillColor('#16263b').font('Helvetica-Bold').fontSize(9).text(`${shipment.items.reduce((sum, item) => sum + item.quantity, 0)} PARCEL ITEM(S)`, 307, 160, { width: 96, align: 'center' });
    document.fontSize(8).text(payment?.method === 'CASH' ? `COLLECT ${payment.amount} ${payment.currencyCode}` : 'NO CASH COLLECTION', 307, 184, { width: 96, align: 'center' });
    document.font('Helvetica').fillColor('#5a6478').fontSize(7).text('CN is the manual lookup reference', 307, 216, { width: 96, align: 'center' });
    document.end();
    const buffer = await complete;
    await this.auditDownload(shipment.organizationId, shipment.id, actor, 'dispatch.label_pdf');
    return { buffer, filename: `${shipment.cnNumber}-label.pdf` };
  }

  private loadDispatch(id: string, actor: AuthenticatedUser) {
    return this.prisma.consignment.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null, ...(actor.roles.includes('SHOP_MANAGER') ? { customerId: actor.customerId } : {}) }, include: { organization: true, customer: true, project: true, parties: true, addresses: true, items: true, events: { orderBy: { eventTime: 'asc' as const } }, payments: true, assignments: { where: { status: 'ACTIVE' }, include: { rider: { include: { user: true } } } } } });
  }

  private async assertCanView(consignmentId: string, actor: AuthenticatedUser) {
    if (actor.roles.includes('SHOP_MANAGER')) {
      const owned = await this.prisma.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId, customerId: actor.customerId, deletedAt: null }, select: { id: true } });
      if (!owned) throw new ForbiddenException('This shipment does not belong to your shop');
      return;
    }
    if (actor.permissions.includes('documents:view')) return;
    if (!actor.riderId) throw new ForbiddenException('Document permission missing');
    const assignment = await this.prisma.riderAssignment.findFirst({
      where: { consignmentId, riderId: actor.riderId, status: 'ACTIVE', consignment: { organizationId: actor.organizationId, deletedAt: null } },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException('This shipment is not assigned to you');
  }

  private auditDownload(organizationId: string, consignmentId: string, actor: AuthenticatedUser, action: string) {
    return this.prisma.auditLog.create({ data: { organizationId, actorId: actor.id, action, entityType: 'consignment', entityId: consignmentId } });
  }
}
