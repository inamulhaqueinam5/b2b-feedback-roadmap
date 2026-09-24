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
  `);

  testDbInstance = drizzle(client, { schema });
  return testDbInstance;
}
