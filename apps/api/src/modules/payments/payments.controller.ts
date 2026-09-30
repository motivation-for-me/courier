import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { CodSettlementDto, PaymentDecisionDto } from './dto/payment.dto';
import { UploadPaymentProofDto } from './dto/payment-proof.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('proofs')
  @RequirePermission('payment:proof')
  uploadProof(@Body() input: UploadPaymentProofDto, @CurrentUser() actor: AuthenticatedUser) { return this.payments.uploadProof(input, actor); }

  @Get('report')
  @RequirePermission('payment:view')
  report(@CurrentUser() actor: AuthenticatedUser) { return this.payments.paymentReport(actor); }

  @Get('cod/report')
  @RequirePermission('payment:view')
  codReport(@CurrentUser() actor: AuthenticatedUser) { return this.payments.codReport(actor); }

  @Post(':id/verify')
  @RequirePermission('payment:verify')
  verify(@Param('id') id: string, @Body() input: PaymentDecisionDto, @CurrentUser() actor: AuthenticatedUser) { return this.payments.verify(id, actor, input.remarks); }

  @Post(':id/reject')
  @RequirePermission('payment:reject')
  reject(@Param('id') id: string, @Body() input: PaymentDecisionDto, @CurrentUser() actor: AuthenticatedUser) { return this.payments.reject(id, actor, input.remarks); }

  @Post('cod/:id/settle')
  @RequirePermission('payment:settle')
  settle(@Param('id') id: string, @Body() input: CodSettlementDto, @CurrentUser() actor: AuthenticatedUser) { return this.payments.settleCod(id, actor, input.amount, input.remarks); }
}
