import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  PayloadTooLargeException,
  Post,
  Put,
  Res,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiNoContentResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ClerkSignInEndpoint, PairingEndpoint } from '../../platform/http/endpoint-access';
import { WorkspaceSessions, WorkspaceOwner, SessionCsrfToken } from './workspace-session';
import {
  ClerkWorkspaceSessionDto,
  SaveWorkspaceDto,
  SessionResponseDto,
  WorkspaceResponseDto,
} from './workspace.dto';
import { WorkspaceRepository } from './workspace.repository';

@ApiTags('workspace')
@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly sessions: WorkspaceSessions,
    private readonly repository: WorkspaceRepository,
  ) {}

  @Post('sign-in')
  @HttpCode(200)
  @ClerkSignInEndpoint()
  @ApiBearerAuth('clerk-session')
  @ApiOperation({
    operationId: 'signInWorkspace',
    summary: 'Bind this browser to its verified Clerk session',
  })
  @ApiOkResponse({ type: ClerkWorkspaceSessionDto })
  async signIn(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ClerkWorkspaceSessionDto> {
    const { cookie, ownerId, csrfToken, expiresAt } = await this.sessions.signIn(request);
    reply.header('set-cookie', cookie);
    return { ownerId, csrfToken, expiresAt };
  }

  @Post('sign-out')
  @HttpCode(204)
  @ApiCookieAuth('workspace-session')
  @ApiHeader({ name: 'X-StudyPal-CSRF', required: true })
  @ApiOperation({
    operationId: 'signOutWorkspace',
    summary: 'Revoke this browser session before signing out of Clerk',
  })
  @ApiNoContentResponse()
  async signOut(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    reply.header('set-cookie', await this.sessions.signOut(request));
  }

  @Post('pair')
  @HttpCode(200)
  @PairingEndpoint()
  @ApiBearerAuth('pairing-key')
  @ApiOperation({
    operationId: 'pairWorkspace',
    summary: 'Pair this local browser with the installation owner',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  pair(@Res({ passthrough: true }) reply: FastifyReply): SessionResponseDto {
    const { cookie, csrfToken } = this.sessions.pair();
    reply.header('set-cookie', cookie);
    return { csrfToken };
  }

  @Get('session')
  @ApiCookieAuth('workspace-session')
  @ApiOperation({
    operationId: 'workspaceSession',
    summary: 'Get the current paired session’s CSRF token',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  session(@SessionCsrfToken() csrfToken: string): SessionResponseDto {
    return { csrfToken };
  }

  @Get()
  @ApiCookieAuth('workspace-session')
  @ApiOperation({
    operationId: 'readWorkspace',
    summary: 'Read the paired owner’s local workspace',
  })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  async read(
    @WorkspaceOwner() ownerId: string,
    @SessionCsrfToken() csrfToken: string,
  ): Promise<WorkspaceResponseDto> {
    return { ...(await this.repository.read(ownerId)), csrfToken };
  }

  @Put()
  @ApiCookieAuth('workspace-session')
  @ApiHeader({ name: 'X-StudyPal-CSRF', required: true })
  @ApiOperation({
    operationId: 'saveWorkspace',
    summary: 'Save a snapshot if the owner’s revision matches',
  })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  async save(
    @WorkspaceOwner() ownerId: string,
    @SessionCsrfToken() csrfToken: string,
    @Body() input: SaveWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    if (Buffer.byteLength(input.content, 'utf8') > 8 * 1024 * 1024)
      throw new PayloadTooLargeException();
    try {
      const parsed: unknown = JSON.parse(input.content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Expected object');
    } catch {
      throw new BadRequestException();
    }
    const snapshot = await this.repository.save(ownerId, input.revision, input.content);
    if (!snapshot) throw new ConflictException();
    return { ...snapshot, csrfToken };
  }
}
