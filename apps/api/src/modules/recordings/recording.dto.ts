import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export const partBytes = 4 * 1024 * 1024;
export class RecordingInputDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 9007199254740991 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  setId!: number;
  @ApiProperty({ maxLength: 300 }) @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() createdAt!: string;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 7200 })
  @IsInt()
  @Min(0)
  @Max(7200)
  seconds!: number;
  @ApiProperty({ maxLength: 100000 }) @IsString() @MaxLength(100000) transcript!: string;
  @ApiProperty()
  @IsString()
  @Matches(/^audio\/(?:webm|mp4|ogg)(?:;\s*codecs=[a-z0-9._,-]+)?$/i)
  mediaType!: string;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 214958080 })
  @IsInt()
  @Min(1)
  @Max(214958080)
  size!: number;
  @ApiProperty({
    description:
      'SHA-256 of the ordered, concatenated lowercase SHA-256 hex digests of each 4 MiB audio part',
  })
  @Matches(/^[a-f0-9]{64}$/)
  audioHash!: string;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 2147483646 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;
}
export class RecordingDto extends RecordingInputDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) nextPart!: number;
  @ApiProperty() @IsBoolean() complete!: boolean;
}
export class AudioPartDto {
  @ApiProperty({ maxLength: 5592408, description: 'Base64 audio bytes (up to 4 MiB)' })
  @IsString()
  @MinLength(4)
  @MaxLength(5592408)
  data!: string;
}
