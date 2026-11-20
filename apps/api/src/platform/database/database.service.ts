import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type DatabaseClient } from '@studypal/database';
import { API_CONFIG } from '../../config/configuration.module';
import type { ApiConfig } from '../../config/env';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: DatabaseClient;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    const logger = new Logger(DatabaseService.name);
    this.client = createDatabase({
      connectionString: config.DATABASE_URL,
      maxConnections: config.DATABASE_POOL_MAX,
      connectionTimeoutMs: 2000,
      statementTimeoutMs: 3000,
      queryTimeoutMs: 4000,
      onError: () => logger.error('Unexpected idle database connection error'),
    });
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
