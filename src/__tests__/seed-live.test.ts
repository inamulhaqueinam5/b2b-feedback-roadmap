import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_FmCIMevu3OV9@ep-proud-moon-b50spc79-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";

describe("Live Neon Database Seeding", () => {
  it("seeds the live Neon database with demo workspace and data", async () => {
    console.log("Connecting to Neon PostgreSQL...");
    const client = postgres(connectionString, { max: 1 });
    const db = drizzle(client, { schema });

    try {
      const result = await seedDatabase(db as any);
      console.log("Successfully seeded Neon database!");
      console.log(`- Workspace: ${result.workspace.name} (slug: ${result.workspace.slug})`);
      console.log(`- Users seeded: ${result.users.length}`);
      console.log(`- Boards seeded: ${result.boards.length}`);
      console.log(`- Posts seeded: ${result.posts.length}`);

      expect(result.workspace.slug).toBe("acme-cloud");
      expect(result.boards.length).toBeGreaterThan(0);
      expect(result.posts.length).toBeGreaterThan(0);
    } finally {
      await client.end();
    }
  }, 60000);
});
