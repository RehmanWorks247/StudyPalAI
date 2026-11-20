import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../../platform/database/database.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceRepository } from './workspace.repository';
import { ClerkVerifier } from './clerk-verifier';
import { ClerkBindings } from './clerk-bindings';
import { WorkspaceSessions } from './workspace-session';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceRepository,
    ClerkVerifier,
    ClerkBindings,
    WorkspaceSessions,
    { provide: APP_GUARD, useExisting: WorkspaceSessions },
  ],
})
export class WorkspaceModule {}
