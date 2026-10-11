import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginDto) {
    const matches = await this.prisma.user.findMany({
      where: { email: input.email.toLowerCase(), isActive: true },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, rider: true },
      take: 2,
    });
    if (matches.length > 1) throw new UnauthorizedException('This email belongs to more than one company. Contact support to select your company.');
    const user = matches[0];
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const authenticated = this.toAuthenticatedUser(user);
    if (!authenticated.roles.length) throw new UnauthorizedException('This account does not have an active application role');
    const accessToken = await this.jwt.signAsync(authenticated, { expiresIn: '15m' });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken, user: authenticated };
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.authSession.findFirst({
      where: { refreshHash: this.hash(refreshToken), revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!session) throw new UnauthorizedException('Invalid refresh session');
    const nextRefreshToken = randomBytes(48).toString('base64url');
    const authenticated = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: session.userId, isActive: true },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, rider: true },
      });
      if (!user) throw new UnauthorizedException('Invalid refresh session');
      const currentUser = this.toAuthenticatedUser(user);
      if (!currentUser.roles.length) throw new UnauthorizedException('This account does not have an active application role');
      const revoked = await transaction.authSession.updateMany({ where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
      if (revoked.count !== 1) throw new ConflictException('Refresh token was already used. Sign in again.');
      await transaction.authSession.create({ data: { userId: user.id, refreshHash: this.hash(nextRefreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
      return currentUser;
    });
    return { accessToken: await this.jwt.signAsync(authenticated, { expiresIn: '15m' }), refreshToken: nextRefreshToken, user: authenticated };
  }

  async logout(refreshToken: string) {
    await this.prisma.authSession.updateMany({ where: { refreshHash: this.hash(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  private toAuthenticatedUser(user: any): AuthenticatedUser {
    const allowedRoles = new Set(['ADMIN', 'SHOP', 'RIDER']);
    const activeAssignments = user.roles.filter((assignment: any) => allowedRoles.has(assignment.role.name));
    const roles = activeAssignments.map((assignment: any) => assignment.role.name);
    const permissions = [...new Set<string>(activeAssignments.flatMap((assignment: any) => assignment.role.permissions.map((item: any) => item.permission.code as string)))];
    return { id: user.id, displayName: user.displayName, organizationId: user.organizationId, customerId: user.customerId ?? undefined, branchId: user.branchId ?? undefined, hubId: user.hubId ?? undefined, riderId: user.rider?.id, roles, permissions };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
