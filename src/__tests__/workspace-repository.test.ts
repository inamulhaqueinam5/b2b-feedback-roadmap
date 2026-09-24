import { describe, expect, it, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { workspaces } from "@/db/schema/workspaces";
import { eq } from "drizzle-orm";
import { createWorkspaceRecord, getWorkspaceRecordBySlug } from "@/db/repositories/workspaces";

describe("Workspace Database Repository", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeAll(async () => {
    db = await getTestDb();
  });

  it("creates a new workspace record with valid properties", async () => {
    const created = await createWorkspaceRecord(db, {
      name: "Acme Corp",
      slug: "acme-corp",
      brandColor: "#0ea5e9",
    });

    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    expect(created.name).toBe("Acme Corp");
    expect(created.slug).toBe("acme-corp");
    expect(created.brandColor).toBe("#0ea5e9");
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it("retrieves an existing workspace by its unique slug", async () => {
    await createWorkspaceRecord(db, {
      name: "Linear HQ",
      slug: "linear-hq",
      brandColor: "#6366f1",
    });

    const found = await getWorkspaceRecordBySlug(db, "linear-hq");
    expect(found).toBeDefined();
    expect(found?.name).toBe("Linear HQ");
    expect(found?.slug).toBe("linear-hq");
  });

  it("returns null when searching for a non-existent workspace slug", async () => {
    const found = await getWorkspaceRecordBySlug(db, "does-not-exist");
    expect(found).toBeNull();
  });

  it("enforces unique constraint and prevents duplicate workspace slugs", async () => {
    await createWorkspaceRecord(db, {
      name: "Duplicate Test",
      slug: "duplicate-slug",
    });

    await expect(
      createWorkspaceRecord(db, {
        name: "Another Duplicate",
        slug: "duplicate-slug",
      })
    ).rejects.toThrow();
  });
});
