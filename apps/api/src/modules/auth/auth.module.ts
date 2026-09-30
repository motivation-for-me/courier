import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET must be configured');

// Authentication is infrastructure shared by controllers in every feature
// module.  Making this module global keeps the guard and its JwtService in the
// same provider scope without creating feature-module import cycles.
@Global()
@Module({
  imports: [JwtModule.register({ secret: jwtSecret })],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [JwtModule, AuthGuard, AuthService],
})
export class AuthModule {}
