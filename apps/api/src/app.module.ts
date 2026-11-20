import { RecordingsModule } from './modules/recordings';
import { FrontierModule } from './modules/frontier';
import { WorkspaceModule } from './modules/workspace';
import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigurationModule } from './config/configuration.module';
import type { ApiConfig } from './config/env';
import { HealthModule } from './modules/health/health.module';

@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigurationModule.register(config),
        HealthModule,
        WorkspaceModule,
        FrontierModule,
        RecordingsModule,
      ],
    };
  }
}
