import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth.types';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../../common/public.decorator';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required');
    let claims: AuthenticatedUser;
    try {
      claims = await this.jwt.verifyAsync<AuthenticatedUser>(header.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    const current = await this.auth.currentUser(claims.id);
    if (current.organizationId !== claims.organizationId || current.authVersion !== (claims.authVersion ?? 0)) throw new UnauthorizedException('Account access changed. Sign in again.');
    request.user = current;
    return true;
  }
}
