import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

let testDbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export async function getTestDb() {
  if (testDbInstance) {
    return testDbInstance;
  }

  const client = new PGlite();
  await client.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(64) NOT NULL,
      slug VARCHAR(48) NOT NULL UNIQUE,
      brand_color VARCHAR(16) NOT NULL DEFAULT '#0ea5e9',
      logo_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS boards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name VARCHAR(64) NOT NULL,
      slug VARCHAR(48) NOT NULL,
      description TEXT,
      icon VARCHAR(32) NOT NULL DEFAULT 'message-square',
      is_private BOOLEAN NOT NULL DEFAULT FALSE,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_boards_workspace_slug UNIQUE (workspace_id, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_boards_workspace_active ON boards(workspace_id, is_archived, sort_order);
  `);

  testDbInstance = drizzle(client, { schema });
  return testDbInstance;
}
