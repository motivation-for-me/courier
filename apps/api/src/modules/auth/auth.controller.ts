import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { ChangePasswordDto, EmailRequestDto, EmailTokenDto, GoogleLoginDto, ResetPasswordDto } from './dto/account.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() input: LoginDto) {
    return this.auth.login(input);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() input: RefreshDto) {
    return this.auth.refresh(input.refreshToken);
  }

  @Post('logout')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  logout(@Body() input: RefreshDto) {
    return this.auth.logout(input.refreshToken);
  }

  @Get('config') @Public()
  config() { return { googleClientId: process.env.GOOGLE_AUTH_ENABLED === 'true' ? process.env.GOOGLE_CLIENT_ID || null : null, emailEnabled: process.env.ACCOUNT_EMAIL_ENABLED === 'true' && !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true' }; }

  @Post('google') @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  google(@Body() input: GoogleLoginDto) { return this.auth.googleLogin(input.credential); }

  @Post('forgot-password') @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  forgot(@Body() input: EmailRequestDto) { return this.auth.requestEmail(input.email, 'RESET_PASSWORD'); }

  @Post('request-verification') @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  requestVerification(@Body() input: EmailRequestDto) { return this.auth.requestEmail(input.email, 'VERIFY_EMAIL'); }

  @Post('verify-email') @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Body() input: EmailTokenDto) { return this.auth.consumeEmail(input.token, 'VERIFY_EMAIL'); }

  @Post('reset-password') @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  reset(@Body() input: ResetPasswordDto) { return this.auth.consumeEmail(input.token, 'RESET_PASSWORD', input.password); }

  @Post('change-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  change(@CurrentUser() actor: AuthenticatedUser, @Body() input: ChangePasswordDto) { return this.auth.changePassword(actor, input.currentPassword, input.password); }
}
