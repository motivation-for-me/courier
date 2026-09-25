import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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
    const user = await this.prisma.user.findFirst({
      where: { email: input.email.toLowerCase(), isActive: true },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, rider: true },
    });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const authenticated = this.toAuthenticatedUser(user);
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
    const user = await this.prisma.user.findFirst({
      where: { id: session.userId, isActive: true },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, rider: true },
    });
    if (!user) throw new UnauthorizedException('Invalid refresh session');
    const authenticated = this.toAuthenticatedUser(user);
    return { accessToken: await this.jwt.signAsync(authenticated, { expiresIn: '15m' }), user: authenticated };
  }

  async logout(refreshToken: string) {
    await this.prisma.authSession.updateMany({ where: { refreshHash: this.hash(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  private toAuthenticatedUser(user: any): AuthenticatedUser {
    const roles = user.roles.map((assignment: any) => assignment.role.name);
    const permissions = user.roles.flatMap((assignment: any) => assignment.role.permissions.map((item: any) => item.permission.code));
    return { id: user.id, organizationId: user.organizationId, branchId: user.branchId ?? undefined, hubId: user.hubId ?? undefined, riderId: user.rider?.id, roles, permissions };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
