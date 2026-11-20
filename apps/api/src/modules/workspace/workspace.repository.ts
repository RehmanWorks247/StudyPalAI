import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { workspaces } from '@studypal/database/schema';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../platform/database/database.service';

interface Snapshot {
  revision: number;
  content: string;
}
const snapshotColumns = { revision: workspaces.revision, content: workspaces.content };

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly database: DatabaseService) {}

  async read(ownerId: string): Promise<Snapshot> {
    try {
      const [record] = await this.database.client.db
        .select(snapshotColumns)
        .from(workspaces)
        .where(eq(workspaces.ownerId, ownerId))
        .limit(1);
      return record ?? { revision: 0, content: '' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }

  async save(ownerId: string, revision: number, content: string): Promise<Snapshot | undefined> {
    const db = this.database.client.db;
    try {
      const [record] =
        revision === 0
          ? await db
              .insert(workspaces)
              .values({ ownerId, revision: 1, content })
              .onConflictDoNothing({ target: workspaces.ownerId })
              .returning(snapshotColumns)
          : await db
              .update(workspaces)
              .set({ revision: revision + 1, content, updatedAt: new Date() })
              .where(and(eq(workspaces.ownerId, ownerId), eq(workspaces.revision, revision)))
              .returning(snapshotColumns);
      return record;
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
