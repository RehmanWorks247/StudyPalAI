import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class SessionResponseDto {
  @ApiProperty({ description: 'CSRF token for this session, required on mutations' })
  csrfToken!: string;
}

export class ClerkWorkspaceSessionDto extends SessionResponseDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Verified server expiry for this StudyPal session binding',
  })
  expiresAt!: string;
  @ApiProperty({
    format: 'uuid',
    description: 'Stable StudyPal owner ID assigned to the verified Clerk account',
  })
  ownerId!: string;
}

export class WorkspaceResponseDto extends SessionResponseDto {
  @ApiProperty({ type: 'integer', minimum: 0 }) revision!: number;
  @ApiProperty({ description: 'Serialized workspace object, or an empty string at revision zero.' })
  content!: string;
}

export class SaveWorkspaceDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 2147483646,
    description: 'Last revision read by this client',
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;
  @ApiProperty({
    minLength: 2,
    maxLength: 8388608,
    description: 'Serialized JSON object, up to 8 MiB of UTF-8',
  })
  @IsString()
  @MinLength(2)
  content!: string;
}
