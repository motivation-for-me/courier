import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
    throw lastError;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
