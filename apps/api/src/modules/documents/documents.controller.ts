import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
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

  @Get('consignments/:id.pdf')
  async consignment(@Param('id') id: string, @Query('download') download: string, @CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    const document = await this.documents.consignmentPdf(id, actor);
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${download === '1' ? 'attachment' : 'inline'}; filename="${document.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    response.send(document.buffer);
  }

  @Get('consignments/:id/label.pdf')
  async label(@Param('id') id: string, @Query('download') download: string, @CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    const document = await this.documents.labelPdf(id, actor);
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${download === '1' ? 'attachment' : 'inline'}; filename="${document.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    response.send(document.buffer);
  }

  // Keep the generic ID route after the PDF routes so Express does not
  // interpret "<uuid>.pdf" as the value of :id.
  @Get('consignments/:id')
  @RequirePermission('documents:view')
  list(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.documents.listForConsignment(id, actor); }
}
