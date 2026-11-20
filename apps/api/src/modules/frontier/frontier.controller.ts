import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WorkspaceOwner } from '../workspace';
import { FrontierJobs } from './frontier-jobs';
import { FrontierJobDto, FrontierRequestDto } from './frontier.dto';
@ApiCookieAuth('workspace-session')
@ApiTags('frontier')
@Controller('frontier/jobs')
export class FrontierController {
  constructor(private readonly jobs: FrontierJobs) {}
  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: 'enqueueFrontierJob' })
  @ApiHeader({ name: 'X-StudyPal-CSRF', required: true })
  @ApiResponse({ status: 202, type: FrontierJobDto })
  enqueue(@WorkspaceOwner() owner: string, @Body() body: FrontierRequestDto) {
    return this.jobs.enqueue(owner, body);
  }
  @Get(':id')
  @ApiOperation({ operationId: 'getFrontierJob' })
  @ApiResponse({ status: 200, type: FrontierJobDto })
  get(@WorkspaceOwner() owner: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(owner, id);
  }
  @Delete(':id')
  @ApiOperation({ operationId: 'cancelFrontierJob' })
  @ApiHeader({ name: 'X-StudyPal-CSRF', required: true })
  @ApiResponse({ status: 200, type: FrontierJobDto })
  cancel(@WorkspaceOwner() owner: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.cancel(owner, id);
  }
}
