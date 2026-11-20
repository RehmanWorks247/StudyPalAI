import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module';
import { FrontierJobs } from './frontier-jobs';
import { FrontierController } from './frontier.controller';
@Module({ imports: [DatabaseModule], providers: [FrontierJobs], controllers: [FrontierController] })
export class FrontierModule {}
