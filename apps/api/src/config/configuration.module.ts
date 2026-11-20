import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { ApiConfig } from './env';

export const API_CONFIG = Symbol('API_CONFIG');

@Global()
@Module({})
export class ConfigurationModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: ConfigurationModule,
      providers: [{ provide: API_CONFIG, useValue: Object.freeze(config) }],
      exports: [API_CONFIG],
    };
  }
}
