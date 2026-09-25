import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { DocumentsService } from './documents.service';
import { RegisterDocumentDto } from './dto/register-document.dto';

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('consignments/:id')
  @RequirePermission('documents:create')
  register(@Param('id') id: string, @Body() input: RegisterDocumentDto, @CurrentUser() actor: AuthenticatedUser) { return this.documents.register(id, input, actor); }

  @Get('consignments/:id')
  @RequirePermission('documents:view')
  list(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.documents.listForConsignment(id, actor); }

  @Get('consignments/:id.pdf')
  @RequirePermission('documents:view')
  async consignment(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    const pdf = await this.documents.consignmentPdf(id, actor);
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${id}.pdf"` });
    response.send(pdf);
  }
}
