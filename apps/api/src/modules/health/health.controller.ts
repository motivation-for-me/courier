import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'courier-api',
      foundation: 'part-1',
    };
  }
}
