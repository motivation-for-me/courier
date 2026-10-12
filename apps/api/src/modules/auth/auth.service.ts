import { requirePasswordBytes } from '../../common/password';
import { requireEmailConfiguration, sendAccountEmail } from './account-email';
import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
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
      where: { email: input.email.trim().toLowerCase(), isActive: true },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, rider: true },
      take: 2,
    });
    if (matches.length > 1) throw new UnauthorizedException('This email belongs to more than one company. Contact support to select your company.');
    const user = matches[0];
    let passwordMatches = false;
    if (user) {
      try {
        passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
      } catch {
        passwordMatches = false;
      }
    }
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerifiedAt) throw new ForbiddenException('Verify your email before signing in. Use Send verification email below.');
    return this.issueSession(user);
  }

  private async issueSession(user: any) {
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
      if (!user || (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerifiedAt)) throw new UnauthorizedException('Invalid refresh session');
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

  toAuthenticatedUser(user: any): AuthenticatedUser {
    const allowedRoles = new Set(['ADMIN', 'SHOP', 'RIDER']);
    const activeAssignments = user.roles.filter((assignment: any) => allowedRoles.has(assignment.role.name));
    const roles = activeAssignments.map((assignment: any) => assignment.role.name);
    let permissions = [...new Set<string>(activeAssignments.flatMap((assignment: any) => assignment.role.permissions.map((item: any) => item.permission.code as string)))];
    if (roles.includes('SHOP') && !roles.includes('ADMIN')) permissions = permissions.filter((permission) => user.shopPermissions.includes(permission));
    return { authVersion: user.authVersion, id: user.id, displayName: user.displayName, organizationId: user.organizationId, customerId: user.customerId ?? undefined, branchId: user.branchId ?? undefined, hubId: user.hubId ?? undefined, riderId: user.rider?.id, roles, permissions };
  }


  async currentUser(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, isActive: true }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, rider: true } });
    if (!user || (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerifiedAt)) throw new UnauthorizedException('Account unavailable or email not verified');
    return this.toAuthenticatedUser(user);
  }

  async requestEmail(email: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    requireEmailConfiguration();
    const message = 'If an eligible account exists, an email with the next steps will be sent.';
    const users = await this.prisma.user.findMany({ where: { email: email.trim().toLowerCase(), isActive: true }, take: 2 });
    if (users.length !== 1 || (purpose === 'VERIFY_EMAIL' && users[0].emailVerifiedAt)) return { message };
    const user = users[0];
    const token = randomBytes(32).toString('base64url');
    const action = await this.prisma.emailAction.create({ data: { userId: user.id, emailAddress: user.email, tokenHash: this.hash(token), purpose, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    try { await sendAccountEmail(user.email, purpose, token); }
    catch (error) { await this.prisma.emailAction.delete({ where: { id: action.id } }); throw error; }
    return { message };
  }

  async consumeEmail(token: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', password?: string) {
    requireEmailConfiguration();
    if (purpose === 'RESET_PASSWORD' && !password) throw new UnauthorizedException('A new password is required');
    if (password) requirePasswordBytes(password);
    const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
    return this.prisma.$transaction(async (transaction) => {
      const action = await transaction.emailAction.findUnique({ where: { tokenHash: this.hash(token) }, include: { user: true } });
      if (!action || action.purpose !== purpose || action.consumedAt || action.expiresAt <= new Date() || !action.user.isActive || action.emailAddress !== action.user.email) throw new UnauthorizedException('This link is invalid or expired. Request a new email.');
      const claimed = await transaction.emailAction.updateMany({ where: { id: action.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (claimed.count !== 1) throw new UnauthorizedException('This link has already been used.');
      await transaction.user.update({ where: { id: action.userId }, data: { emailVerifiedAt: new Date(), authVersion: { increment: 1 }, ...(passwordHash ? { passwordHash } : {}) } });
      await transaction.authSession.updateMany({ where: { userId: action.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (passwordHash) {
        await transaction.emailAction.updateMany({ where: { userId: action.userId, purpose: 'RESET_PASSWORD', consumedAt: null }, data: { consumedAt: new Date() } });
      }
      await transaction.auditLog.create({ data: { organizationId: action.user.organizationId, actorId: action.userId, action: purpose === 'VERIFY_EMAIL' ? 'account.email_verified' : 'account.password_reset', entityType: 'user', entityId: action.userId } });
      return { message: purpose === 'VERIFY_EMAIL' ? 'Email verified. You can now sign in.' : 'Password updated. Sign in with your new password.' };
    }, { isolationLevel: 'Serializable' });
  }

  async changePassword(actor: AuthenticatedUser, currentPassword: string, password: string) {
    requirePasswordBytes(password);
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash, authVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Account changed. Sign in and try again.');
      await transaction.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await transaction.emailAction.updateMany({ where: { userId: user.id, purpose: 'RESET_PASSWORD', consumedAt: null }, data: { consumedAt: new Date() } });
      await transaction.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: 'account.password_changed', entityType: 'user', entityId: user.id } });
    });
    return { message: 'Password changed. Sign in again on your devices.' };
  }

  async googleLogin(credential: string) {
    if (process.env.GOOGLE_AUTH_ENABLED !== 'true') throw new ServiceUnavailableException('Google sign-in is temporarily disabled.');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not configured.');
    const { OAuth2Client } = await import('google-auth-library');
    let payload;
    try { payload = (await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId })).getPayload(); }
    catch { throw new UnauthorizedException('Google identity could not be verified'); }
    if (!payload?.sub || !payload.email || !payload.email_verified) throw new UnauthorizedException('A verified Google email is required');
    const include = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, rider: true } as const;
    let user = await this.prisma.user.findUnique({ where: { googleSubject: payload.sub }, include });
    if (!user) {
      // Google is authoritative for Gmail and verified Workspace addresses only.
      if (!payload.email.endsWith('@gmail.com') && !payload.hd) throw new UnauthorizedException('Use email and password for this address.');
      const matches = await this.prisma.user.findMany({ where: { email: payload.email.toLowerCase(), isActive: true }, include, take: 2 });
      if (matches.length !== 1 || matches[0].googleSubject) throw new UnauthorizedException('An administrator must create an active account for this email first.');
      const linked = await this.prisma.user.updateMany({ where: { id: matches[0].id, googleSubject: null, isActive: true }, data: { googleSubject: payload.sub, emailVerifiedAt: new Date(), authVersion: { increment: 1 } } });
      if (linked.count !== 1) throw new UnauthorizedException('Account changed. Please sign in again.');
      user = await this.prisma.user.findUniqueOrThrow({ where: { id: matches[0].id }, include });
    }
    if (!user.isActive) throw new UnauthorizedException('Account disabled');
    return this.issueSession(user);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
