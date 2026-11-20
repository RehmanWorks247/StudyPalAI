import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  PickType,
} from '@nestjs/swagger';
import { WorkspaceOwner } from '../workspace';
import { AudioPartDto, RecordingDto, RecordingInputDto } from './recording.dto';
import { RecordingRepository } from './recording.repository';

class RecordingListItemDto extends PickType(RecordingDto, [
  'id',
  'title',
  'seconds',
  'size',
  'revision',
  'complete',
] as const) {}
const csrf = () => ApiHeader({ name: 'X-StudyPal-CSRF', required: true });
@ApiTags('recordings')
@ApiCookieAuth('workspace-session')
@Controller('recordings')
export class RecordingController {
  constructor(private readonly repo: RecordingRepository) {}
  @Get()
  @ApiOperation({ operationId: 'listRecordings' })
  @ApiQuery({ name: 'setId', type: Number })
  @ApiOkResponse({ type: [RecordingListItemDto] })
  list(@WorkspaceOwner() owner: string, @Query('setId', ParseIntPipe) setId: number) {
    if (!Number.isSafeInteger(setId) || setId <= 0) throw new BadRequestException();
    return this.repo.list(owner, setId);
  }
  @Get(':id')
  @ApiOperation({ operationId: 'getRecording' })
  @ApiOkResponse({ type: RecordingDto })
  get(@WorkspaceOwner() owner: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo.get(owner, id);
  }
  @Put(':id')
  @csrf()
  @ApiOperation({ operationId: 'beginRecordingBackup' })
  @ApiOkResponse({ type: RecordingDto })
  begin(
    @WorkspaceOwner() owner: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RecordingInputDto,
  ) {
    return this.repo.begin(owner, id, input);
  }
  @Put(':id/parts/:part')
  @csrf()
  @ApiOperation({ operationId: 'saveRecordingPart' })
  @ApiParam({ name: 'part', type: Number })
  @ApiOkResponse({ type: RecordingDto })
  save(
    @WorkspaceOwner() owner: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('part', ParseIntPipe) part: number,
    @Body() input: AudioPartDto,
  ) {
    return this.repo.savePart(owner, id, part, input.data);
  }
  @Get(':id/parts/:part')
  @ApiOperation({ operationId: 'readRecordingPart' })
  @ApiParam({ name: 'part', type: Number })
  @ApiOkResponse({ type: AudioPartDto })
  read(
    @WorkspaceOwner() owner: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('part', ParseIntPipe) part: number,
  ) {
    return this.repo.readPart(owner, id, part);
  }
  @Delete(':id')
  @HttpCode(204)
  @csrf()
  @ApiOperation({ operationId: 'deleteRecordingBackup' })
  @ApiQuery({ name: 'revision', type: Number })
  @ApiNoContentResponse()
  remove(
    @WorkspaceOwner() owner: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('revision', ParseIntPipe) revision: number,
  ) {
    return this.repo.remove(owner, id, revision);
  }
}
