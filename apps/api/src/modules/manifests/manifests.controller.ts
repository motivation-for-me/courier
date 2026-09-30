import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { CreateManifestDto } from './dto/create-manifest.dto';
import { ManifestItemsDto, ReceiveManifestDto } from './dto/manifest-items.dto';
import { ManifestsService } from './manifests.service';

@Controller('manifests')
@UseGuards(AuthGuard)
export class ManifestsController {
  constructor(private readonly manifests: ManifestsService) {}

  @Post()
  @RequirePermission('manifest:create')
  create(@Body() input: CreateManifestDto, @CurrentUser() actor: AuthenticatedUser) { return this.manifests.create(input, actor); }

  @Post(':id/items')
  @RequirePermission('manifest:update')
  add(@Param('id') id: string, @Body() input: ManifestItemsDto, @CurrentUser() actor: AuthenticatedUser) { return this.manifests.addShipments(id, input.consignmentIds, actor); }

  @Post(':id/seal')
  @RequirePermission('manifest:seal')
  seal(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.manifests.seal(id, actor); }

  @Post(':id/dispatch')
  @RequirePermission('manifest:dispatch')
  dispatch(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.manifests.dispatch(id, actor); }

  @Post(':id/receive')
  @RequirePermission('manifest:receive')
  receive(@Param('id') id: string, @Body() input: ReceiveManifestDto, @CurrentUser() actor: AuthenticatedUser) { return this.manifests.receive(id, input.receivedConsignmentIds, actor, input.remarks); }

  @Post(':id/reconcile')
  @RequirePermission('manifest:reconcile')
  reconcile(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.manifests.reconcile(id, actor); }
}
