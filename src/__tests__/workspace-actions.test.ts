import { describe, expect, it, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import {
  validateWorkspaceSlugAction,
  createWorkspaceAction,
  getWorkspaceAction,
} from "@/actions/workspaces";

describe("Workspace Server Actions Boundary", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeAll(async () => {
    db = await getTestDb();
  });

  describe("validateWorkspaceSlugAction", () => {
    it("reports an available slug for a new valid name", async () => {
      const result = await validateWorkspaceSlugAction("available-brand", db);
      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects an invalid slug format", async () => {
      const result = await validateWorkspaceSlugAction("Invalid Slug!", db);
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/lowercase letters/);
    });

    it("rejects reserved keywords", async () => {
      const result = await validateWorkspaceSlugAction("admin", db);
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/reserved/);
    });

    it("detects already taken slugs in the database", async () => {
      await createWorkspaceAction(
        {
          name: "Existing Company",
          slug: "taken-slug",
        },
        db
      );

      const result = await validateWorkspaceSlugAction("taken-slug", db);
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/already taken/);
    });
  });

  describe("createWorkspaceAction", () => {
    it("provisions a new workspace record and returns the created data", async () => {
      const result = await createWorkspaceAction(
        {
          name: "Vercel Team",
          slug: "vercel-team",
          brandColor: "#000000",
        },
        db
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workspace.name).toBe("Vercel Team");
        expect(result.workspace.slug).toBe("vercel-team");
        expect(result.workspace.brandColor).toBe("#000000");
      }
    });

    it("rejects invalid input data with descriptive validation errors", async () => {
      const result = await createWorkspaceAction(
        {
          name: "A", // too short
          slug: "v", // too short
        },
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("prevents duplicate workspace creation with the same slug", async () => {
      const first = await createWorkspaceAction(
        {
          name: "First Company",
          slug: "unique-company",
        },
        db
      );
      expect(first.success).toBe(true);

      const duplicate = await createWorkspaceAction(
        {
          name: "Duplicate Company",
          slug: "unique-company",
        },
        db
      );
      expect(duplicate.success).toBe(false);
      if (!duplicate.success) {
        expect(duplicate.error).toMatch(/already taken/);
      }
    });
  });

  describe("getWorkspaceAction & Tenant Boundary Isolation", () => {
    it("returns tenant workspace data for valid existing slug", async () => {
      await createWorkspaceAction(
        {
          name: "Tenant Alpha",
          slug: "tenant-alpha",
        },
        db
      );

      const result = await getWorkspaceAction("tenant-alpha", db);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workspace.slug).toBe("tenant-alpha");
        expect(result.workspace.name).toBe("Tenant Alpha");
      }
    });

    it("fails cleanly and isolates non-existent tenants", async () => {
      const result = await getWorkspaceAction("unknown-tenant-slug", db);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Workspace not found");
      }
    });
  });
});
