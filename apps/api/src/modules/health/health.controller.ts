import { PublicEndpoint } from '../../platform/http/endpoint-access';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../platform/database/database.service';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@PublicEndpoint()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  @ApiOperation({
    operationId: 'healthLive',
    summary: 'Check whether the API process can serve requests',
  })
  @ApiResponse({ status: 200, type: HealthResponseDto })
  live(): HealthResponseDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({
    operationId: 'healthReady',
    summary: 'Check whether the API can reach PostgreSQL',
  })
  @ApiResponse({
    status: 200,
    type: HealthResponseDto,
    headers: {
      'x-studypal-auth-mode': {
        description: 'Configured workspace authentication mode',
        schema: { type: 'string', enum: ['clerk', 'local'] },
      },
    },
  })
  @ApiResponse({
    status: 503,
    content: {
      'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDto' } },
    },
  })
  async ready(): Promise<HealthResponseDto> {
    try {
      await this.database.ping();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
