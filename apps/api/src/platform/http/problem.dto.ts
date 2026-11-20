import { ApiProperty } from '@nestjs/swagger';

export class ProblemDto {
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty({ example: 'Service Unavailable' })
  title!: string;

  @ApiProperty({ example: 503 })
  status!: number;

  @ApiProperty({ example: 'The service is temporarily unavailable.' })
  detail!: string;

  @ApiProperty({ example: '/api/v1/health/ready' })
  instance!: string;

  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}
