import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { UploadPaymentProofDto } from './dto/payment-proof.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(paymentId: string, actor: AuthenticatedUser, remarks?: string) { return this.decide(paymentId, actor, PaymentStatus.VERIFIED, remarks); }
  async reject(paymentId: string, actor: AuthenticatedUser, remarks?: string) { return this.decide(paymentId, actor, PaymentStatus.REJECTED, remarks); }

  async uploadProof(input: UploadPaymentProofDto, actor: AuthenticatedUser) {
    if (!actor.permissions.includes('payment:proof')) throw new ForbiddenException('Payment proof permission missing');
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
    if (!allowedTypes.has(input.mimeType)) throw new BadRequestException('Only JPEG, PNG, and PDF proofs are supported');
    if (!input.sizeBytes || input.sizeBytes < 1 || input.sizeBytes > 10 * 1024 * 1024) throw new BadRequestException('Payment proof must be between 1 byte and 10 MB');
    if (!input.storageKey || input.storageKey.includes('..') || input.storageKey.startsWith('/')) throw new BadRequestException('Invalid storage key');
    return this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findFirst({ where: { id: input.paymentId, consignment: { organizationId: actor.organizationId } } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status === PaymentStatus.VERIFIED || payment.status === PaymentStatus.REJECTED) throw new BadRequestException('Payment decision already recorded');
      const document = await transaction.document.create({ data: { organizationId: actor.organizationId, consignmentId: payment.consignmentId, type: 'PAYMENT_PROOF', storageKey: input.storageKey, mimeType: input.mimeType, checksum: input.checksum, createdById: actor.id } });
      const proof = await transaction.paymentProof.create({ data: { paymentId: payment.id, documentId: document.id, uploadedById: actor.id } });
      const updated = await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.VERIFICATION_PENDING } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'payment.proof_uploaded', entityType: 'payment', entityId: payment.id, oldValues: { status: payment.status }, newValues: { status: updated.status, documentId: document.id, sizeBytes: input.sizeBytes, mimeType: input.mimeType } } });
      return { payment: updated, proof, document };
    });
  }

  async settleCod(codTransactionId: string, actor: AuthenticatedUser, amount: number, remarks?: string) {
    if (!actor.permissions.includes('payment:settle')) throw new ForbiddenException('Settlement permission missing');
    return this.prisma.$transaction(async (transaction) => {
      const cod = await transaction.codTransaction.findFirst({ where: { id: codTransactionId, consignment: { organizationId: actor.organizationId } }, include: { settlements: true } });
      if (!cod) throw new NotFoundException('COD transaction not found');
      if (cod.settlements.some((item) => item.settledAt)) throw new BadRequestException('COD transaction is already settled');
      if (Number(amount) > Number(cod.collectedAmount ?? 0)) throw new BadRequestException('Settlement cannot exceed collected COD');
      const settlement = await transaction.codSettlement.create({ data: { codTransactionId, amount, variance: Number(cod.expectedAmount) - amount, toBranchId: actor.branchId, approvedById: actor.id, settledAt: new Date(), remarks } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'cod.settled', entityType: 'cod_transaction', entityId: codTransactionId, newValues: { amount, remarks } } });
      return settlement;
    });
  }

  async paymentReport(actor: AuthenticatedUser) {
    if (!actor.permissions.includes('payment:view')) throw new ForbiddenException('Payment view permission missing');
    return this.prisma.payment.findMany({ where: { consignment: { organizationId: actor.organizationId } }, include: { proofs: { include: { document: true } }, consignment: { select: { id: true, cnNumber: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  async codReport(actor: AuthenticatedUser) {
    if (!actor.permissions.includes('payment:view')) throw new ForbiddenException('Payment view permission missing');
    return this.prisma.codTransaction.findMany({ where: { consignment: { organizationId: actor.organizationId } }, include: { settlements: true, consignment: { select: { id: true, cnNumber: true, status: true } } }, orderBy: { consignmentId: 'asc' }, take: 500 });
  }

  private async decide(paymentId: string, actor: AuthenticatedUser, status: PaymentStatus, remarks?: string) {
    if (!actor.permissions.includes('payment:verify')) throw new ForbiddenException('Payment verification permission missing');
    return this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findFirst({ where: { id: paymentId, consignment: { organizationId: actor.organizationId } } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status === PaymentStatus.VERIFIED || payment.status === PaymentStatus.REJECTED) throw new BadRequestException('Payment decision already recorded');
      const updated = await transaction.payment.update({ where: { id: paymentId }, data: { status, verifiedById: actor.id, verifiedAt: new Date(), remarks } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: `payment.${status.toLowerCase()}`, entityType: 'payment', entityId: paymentId, oldValues: { status: payment.status }, newValues: { status, remarks } } });
      return updated;
    });
  }
}
