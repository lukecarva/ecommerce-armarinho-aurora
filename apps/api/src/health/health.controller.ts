import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Infraestrutura')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({
    description: 'Estado da API e do banco. Usado pelo deploy e pelo monitoramento.',
    schema: {
      example: {
        status: 'ok',
        database: 'up',
        uptime: 123.4,
        timestamp: '2026-09-08T20:00:00.000Z',
      },
    },
  })
  async check() {
    const database = (await this.prisma.ping()) ? 'up' : 'down';

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime() * 10) / 10,
      timestamp: new Date().toISOString(),
    };
  }
}
