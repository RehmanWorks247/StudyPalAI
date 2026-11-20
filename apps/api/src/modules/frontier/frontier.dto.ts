import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FrontierPassageDto {
  @ApiProperty({ maxLength: 240 }) @IsString() @Length(1, 240) name!: string;
  @ApiProperty({ maxLength: 1100 }) @IsString() @Length(6, 1100) text!: string;
}
export class FrontierRequestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestId!: string;
  @ApiProperty({ enum: ['quiz', 'grade'] }) @IsIn(['quiz', 'grade']) kind!: 'quiz' | 'grade';
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) count!: number;
  @ApiProperty({ maxLength: 1500 }) @IsString() @MaxLength(1500) prompt!: string;
  @ApiProperty({ type: [FrontierPassageDto], minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => FrontierPassageDto)
  passages!: FrontierPassageDto[];
}
export class FrontierQuestionDto {
  @ApiProperty() question!: string;
  @ApiProperty() correct!: string;
  @ApiProperty({ type: [String] }) distractors!: string[];
  @ApiProperty() explanation!: string;
  @ApiProperty() quote!: string;
}
export class FrontierGradeDto {
  @ApiProperty({ minimum: 0, maximum: 4 }) score!: number;
  @ApiProperty() strength!: string;
  @ApiProperty() improvement!: string;
  @ApiProperty() quote!: string;
}
export class FrontierResultDto {
  @ApiPropertyOptional({ type: [FrontierQuestionDto] }) questions?: FrontierQuestionDto[];
  @ApiPropertyOptional({ type: FrontierGradeDto }) grade?: FrontierGradeDto;
}
export const statuses = ['queued', 'running', 'completed', 'failed', 'canceled'] as const;
export class FrontierJobDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: statuses, type: String }) status!: (typeof statuses)[number];
  @ApiPropertyOptional({ type: FrontierResultDto }) result?: FrontierResultDto;
}
