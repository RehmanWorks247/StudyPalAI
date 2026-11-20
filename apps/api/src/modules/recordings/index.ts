import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module';
import { RecordingController } from './recording.controller';
import { RecordingRepository } from './recording.repository';
@Module({
  imports: [DatabaseModule],
  controllers: [RecordingController],
  providers: [RecordingRepository],
})
export class RecordingsModule {}
