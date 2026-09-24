import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import {
  createBoardRecord,
  getBoardRecordBySlug,
  getBoardRecordById,
  listBoardsForWorkspace,
  updateBoardRecord,
  archiveBoardRecord,
  reorderBoardRecords,
} from "@/db/repositories/boards";
import type { Workspace } from "@/db/schema/workspaces";

describe("Board Repository", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace1: Workspace;
  let workspace2: Workspace;

  beforeAll(async () => {
    db = await getTestDb();
    workspace1 = await createWorkspaceRecord(db, {
      name: "Acme Corp",
      slug: "acme-corp-boards",
    });
    workspace2 = await createWorkspaceRecord(db, {
      name: "Beta Inc",
      slug: "beta-inc-boards",
    });
  });

  it("creates a new board linked to a workspace", async () => {
    const board = await createBoardRecord(db, workspace1.id, {
      name: "Feature Requests",
      slug: "feature-requests",
      description: "Submit ideas for new features",
      icon: "lightbulb",
      isPrivate: false,
    });

    expect(board.id).toBeDefined();
    expect(board.workspaceId).toBe(workspace1.id);
    expect(board.name).toBe("Feature Requests");
    expect(board.slug).toBe("feature-requests");
    expect(board.icon).toBe("lightbulb");
    expect(board.isPrivate).toBe(false);
    expect(board.isArchived).toBe(false);
  });

  it("enforces unique slugs per workspace but allows duplicate slugs across different workspaces", async () => {
    // Same slug in workspace2 should succeed
    const boardInWs2 = await createBoardRecord(db, workspace2.id, {
      name: "Feature Requests",
      slug: "feature-requests",
    });
    expect(boardInWs2.workspaceId).toBe(workspace2.id);

    // Duplicate slug in workspace1 should throw unique constraint violation
    await expect(
      createBoardRecord(db, workspace1.id, {
        name: "Another Feature Requests",
        slug: "feature-requests",
      })
    ).rejects.toThrow();
  });

  it("fetches a board by slug within its workspace", async () => {
    const board = await getBoardRecordBySlug(db, workspace1.id, "feature-requests");
    expect(board).not.toBeNull();
    expect(board?.name).toBe("Feature Requests");

    // Querying with wrong workspace returns null
    const nonExistent = await getBoardRecordBySlug(db, "00000000-0000-0000-0000-000000000000", "feature-requests");
    expect(nonExistent).toBeNull();
  });

  it("fetches a board by id within its workspace", async () => {
    const created = await createBoardRecord(db, workspace1.id, {
      name: "Bug Reports",
      slug: "bug-reports",
      icon: "bug",
      isPrivate: false,
    });

    const found = await getBoardRecordById(db, workspace1.id, created.id);
    expect(found).not.toBeNull();
    expect(found?.slug).toBe("bug-reports");

    // Cross-tenant fetch by ID returns null
    const crossTenant = await getBoardRecordById(db, workspace2.id, created.id);
    expect(crossTenant).toBeNull();
  });

  it("lists public boards and respects private visibility filter", async () => {
    await createBoardRecord(db, workspace1.id, {
      name: "Internal Roadmap",
      slug: "internal-roadmap",
      isPrivate: true,
      sortOrder: 2,
    });

    // Public list excludes private boards
    const publicBoards = await listBoardsForWorkspace(db, workspace1.id, {
      includePrivate: false,
    });
    const publicSlugs = publicBoards.map((b) => b.slug);
    expect(publicSlugs).toContain("feature-requests");
    expect(publicSlugs).toContain("bug-reports");
    expect(publicSlugs).not.toContain("internal-roadmap");

    // Authenticated / admin list includes private boards
    const allBoards = await listBoardsForWorkspace(db, workspace1.id, {
      includePrivate: true,
    });
    const allSlugs = allBoards.map((b) => b.slug);
    expect(allSlugs).toContain("internal-roadmap");
  });

  it("updates an existing board", async () => {
    const board = await createBoardRecord(db, workspace1.id, {
      name: "Integrations",
      slug: "integrations",
    });

    const updated = await updateBoardRecord(db, workspace1.id, board.id, {
      name: "Third-Party Integrations",
      description: "Zapier, Slack and GitHub integrations",
      icon: "puzzle",
    });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Third-Party Integrations");
    expect(updated?.description).toBe("Zapier, Slack and GitHub integrations");
    expect(updated?.icon).toBe("puzzle");

    // Tenant mismatch update returns null
    const invalidUpdate = await updateBoardRecord(db, workspace2.id, board.id, {
      name: "Hacked",
    });
    expect(invalidUpdate).toBeNull();
  });

  it("archives a board and excludes it from active listing", async () => {
    const board = await createBoardRecord(db, workspace1.id, {
      name: "Deprecated Ideas",
      slug: "deprecated-ideas",
    });

    const archived = await archiveBoardRecord(db, workspace1.id, board.id);
    expect(archived).toBe(true);

    const activeBoards = await listBoardsForWorkspace(db, workspace1.id, {
      includePrivate: true,
      includeArchived: false,
    });
    const slugs = activeBoards.map((b) => b.slug);
    expect(slugs).not.toContain("deprecated-ideas");
  });

  it("reorders boards in the workspace", async () => {
    const b1 = await createBoardRecord(db, workspace1.id, {
      name: "Board One",
      slug: "board-one",
      sortOrder: 0,
    });
    const b2 = await createBoardRecord(db, workspace1.id, {
      name: "Board Two",
      slug: "board-two",
      sortOrder: 1,
    });

    await reorderBoardRecords(db, workspace1.id, [
      { id: b1.id, sortOrder: 10 },
      { id: b2.id, sortOrder: 5 },
    ]);

    const reordered = await listBoardsForWorkspace(db, workspace1.id, {
      includePrivate: true,
    });
    const b1Found = reordered.find((b) => b.id === b1.id);
    const b2Found = reordered.find((b) => b.id === b2.id);

    expect(b1Found?.sortOrder).toBe(10);
    expect(b2Found?.sortOrder).toBe(5);
  });
});
