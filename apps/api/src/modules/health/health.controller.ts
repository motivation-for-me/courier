import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'courier-api',
      foundation: 'part-1',
    };
  }

  @Get('ready')
  async getReadiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
      await this.prisma.$queryRaw`SELECT 1 FROM "AuthSession" LIMIT 1`;
      return { status: 'ready', service: 'courier-api', database: 'connected', authSchema: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }
  }
}
