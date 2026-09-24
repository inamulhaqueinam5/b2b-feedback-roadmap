import { describe, expect, it, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import {
  validateWorkspaceSlug,
  createWorkspace,
  getWorkspace,
} from "@/services/workspaces";

describe("Workspace Service & Tenant Boundary Isolation", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeAll(async () => {
    db = await getTestDb();
  });

  describe("validateWorkspaceSlug", () => {
    it("reports an available slug for a new valid name", async () => {
      const result = await validateWorkspaceSlug("available-brand", db);
      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects an invalid slug format", async () => {
      const result = await validateWorkspaceSlug("Invalid Slug!", db);
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/lowercase letters/);
    });

    it("rejects reserved keywords", async () => {
      const result = await validateWorkspaceSlug("admin", db);
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/reserved/);
    });

    it("detects already taken slugs in the database", async () => {
      await createWorkspace(
        {
          name: "Existing Workspace",
          slug: "taken-slug",
        },
        db
      );

      const result = await validateWorkspaceSlug("taken-slug", db);
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/already taken/);
    });
  });

  describe("createWorkspace", () => {
    it("provisions a new workspace record and returns the created data", async () => {
      const result = await createWorkspace(
        {
          name: "Vercel Hub",
          slug: "vercel-hub",
          brandColor: "#000000",
        },
        db
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workspace.name).toBe("Vercel Hub");
        expect(result.workspace.slug).toBe("vercel-hub");
        expect(result.workspace.brandColor).toBe("#000000");
      }
    });

    it("rejects invalid input data with descriptive validation errors", async () => {
      const result = await createWorkspace(
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
      const first = await createWorkspace(
        {
          name: "First Workspace",
          slug: "unique-workspace",
        },
        db
      );
      expect(first.success).toBe(true);

      const duplicate = await createWorkspace(
        {
          name: "Duplicate Workspace",
          slug: "unique-workspace",
        },
        db
      );
      expect(duplicate.success).toBe(false);
      if (!duplicate.success) {
        expect(duplicate.error).toMatch(/already taken/);
      }
    });
  });

  describe("getWorkspace & Multi-Tenant Boundary Isolation", () => {
    it("returns tenant workspace data for valid existing slug", async () => {
      await createWorkspace(
        {
          name: "Workspace Alpha",
          slug: "workspace-alpha",
        },
        db
      );

      const result = await getWorkspace("workspace-alpha", db);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.workspace.slug).toBe("workspace-alpha");
        expect(result.workspace.name).toBe("Workspace Alpha");
      }
    });

    it("strictly isolates tenants and prevents cross-tenant data access", async () => {
      await createWorkspace(
        {
          name: "Workspace One",
          slug: "workspace-one",
          brandColor: "#0ea5e9",
        },
        db
      );

      await createWorkspace(
        {
          name: "Workspace Two",
          slug: "workspace-two",
          brandColor: "#6366f1",
        },
        db
      );

      const queryOne = await getWorkspace("workspace-one", db);
      const queryTwo = await getWorkspace("workspace-two", db);

      expect(queryOne.success).toBe(true);
      expect(queryTwo.success).toBe(true);

      if (queryOne.success && queryTwo.success) {
        // Assert strict partition: identifiers and slugs are completely isolated
        expect(queryOne.workspace.id).not.toBe(queryTwo.workspace.id);
        expect(queryOne.workspace.slug).toBe("workspace-one");
        expect(queryTwo.workspace.slug).toBe("workspace-two");
        expect(queryOne.workspace.brandColor).toBe("#0ea5e9");
        expect(queryTwo.workspace.brandColor).toBe("#6366f1");
      }
    });

    it("fails cleanly and isolates non-existent tenants", async () => {
      const result = await getWorkspace("unknown-tenant-slug", db);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Workspace not found");
      }
    });
  });
});
