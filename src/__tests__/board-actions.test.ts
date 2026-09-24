import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import {
  createBoard,
  updateBoard,
  archiveBoard,
  reorderBoards,
  getBoardsForWorkspace,
  getBoardBySlug,
  type ActorContext,
} from "@/services/boards";
import type { Workspace } from "@/db/schema/workspaces";

describe("Board Service & Authorization Boundaries", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let otherWorkspace: Workspace;

  const adminActor: ActorContext = { userId: "user-admin-1", role: "admin" };
  const ownerActor: ActorContext = { userId: "user-owner-1", role: "owner" };
  const memberActor: ActorContext = { userId: "user-member-1", role: "member" };
  const visitorActor: ActorContext = { role: "visitor" };

  beforeAll(async () => {
    db = await getTestDb();
    workspace = await createWorkspaceRecord(db, {
      name: "SaaS Rocket",
      slug: "saas-rocket-boards",
    });
    otherWorkspace = await createWorkspaceRecord(db, {
      name: "Other Company",
      slug: "other-company-boards",
    });
  });

  describe("Board Creation Permissions", () => {
    it("allows workspace admin to create a public board", async () => {
      const res = await createBoard(
        workspace.slug,
        {
          name: "Feature Requests",
          slug: "feature-requests",
          description: "Customer feature suggestions",
          icon: "sparkles",
          isPrivate: false,
        },
        adminActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.board.name).toBe("Feature Requests");
        expect(res.board.isPrivate).toBe(false);
      }
    });

    it("allows workspace owner to create a private board", async () => {
      const res = await createBoard(
        workspace.slug,
        {
          name: "Executive Roadmap",
          slug: "executive-roadmap",
          description: "Internal roadmap for board members",
          icon: "shield",
          isPrivate: true,
        },
        ownerActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.board.name).toBe("Executive Roadmap");
        expect(res.board.isPrivate).toBe(true);
      }
    });

    it("blocks regular member from creating a board", async () => {
      const res = await createBoard(
        workspace.slug,
        {
          name: "Unauthorized Board",
          slug: "unauthorized-board",
        },
        memberActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(/unauthorized/i);
      }
    });

    it("blocks anonymous visitor from creating a board", async () => {
      const res = await createBoard(
        workspace.slug,
        {
          name: "Visitor Board",
          slug: "visitor-board",
        },
        visitorActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(/unauthorized/i);
      }
    });

    it("rejects duplicate board slug in the same workspace", async () => {
      const res = await createBoard(
        workspace.slug,
        {
          name: "Duplicate Requests",
          slug: "feature-requests",
        },
        adminActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(/already exists/i);
      }
    });
  });

  describe("Board Visibility & Privacy Restrictions", () => {
    it("hides private boards from unauthenticated visitors", async () => {
      const res = await getBoardsForWorkspace(workspace.slug, visitorActor, db);
      expect(res.success).toBe(true);
      if (res.success) {
        const slugs = res.boards.map((b) => b.slug);
        expect(slugs).toContain("feature-requests");
        expect(slugs).not.toContain("executive-roadmap");
      }
    });

    it("hides private boards when querying by slug as a visitor", async () => {
      const res = await getBoardBySlug(
        workspace.slug,
        "executive-roadmap",
        visitorActor,
        db
      );
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(/not found/i);
      }
    });

    it("allows members and admins to see private boards", async () => {
      const memberRes = await getBoardsForWorkspace(workspace.slug, memberActor, db);
      expect(memberRes.success).toBe(true);
      if (memberRes.success) {
        const slugs = memberRes.boards.map((b) => b.slug);
        expect(slugs).toContain("feature-requests");
        expect(slugs).toContain("executive-roadmap");
      }

      const boardRes = await getBoardBySlug(
        workspace.slug,
        "executive-roadmap",
        adminActor,
        db
      );
      expect(boardRes.success).toBe(true);
      if (boardRes.success) {
        expect(boardRes.board.slug).toBe("executive-roadmap");
      }
    });
  });

  describe("Board Updating & Archiving", () => {
    it("allows admin to update board details", async () => {
      const boardsRes = await getBoardsForWorkspace(workspace.slug, adminActor, db);
      expect(boardsRes.success).toBe(true);
      if (!boardsRes.success) return;

      const target = boardsRes.boards.find((b) => b.slug === "feature-requests");
      expect(target).toBeDefined();
      if (!target) return;

      const updateRes = await updateBoard(
        workspace.slug,
        target.id,
        {
          name: "Ideas & Requests",
          description: "Community feedback and feature wishlist",
        },
        adminActor,
        db
      );

      expect(updateRes.success).toBe(true);
      if (updateRes.success) {
        expect(updateRes.board.name).toBe("Ideas & Requests");
      }
    });

    it("allows admin to archive a board and removes it from regular listings", async () => {
      const created = await createBoard(
        workspace.slug,
        {
          name: "Temporary Board",
          slug: "temp-board",
        },
        adminActor,
        db
      );
      expect(created.success).toBe(true);
      if (!created.success) return;

      const archiveRes = await archiveBoard(
        workspace.slug,
        created.board.id,
        adminActor,
        db
      );
      expect(archiveRes.success).toBe(true);

      const fetchRes = await getBoardsForWorkspace(workspace.slug, adminActor, db);
      expect(fetchRes.success).toBe(true);
      if (fetchRes.success) {
        const slugs = fetchRes.boards.map((b) => b.slug);
        expect(slugs).not.toContain("temp-board");
      }
    });

    it("blocks cross-tenant board updates", async () => {
      const boardsRes = await getBoardsForWorkspace(workspace.slug, adminActor, db);
      if (!boardsRes.success) return;
      const target = boardsRes.boards[0];

      // Try updating target board using otherWorkspace's slug
      const crossRes = await updateBoard(
        otherWorkspace.slug,
        target.id,
        { name: "Malicious Edit" },
        adminActor,
        db
      );

      expect(crossRes.success).toBe(false);
    });
  });

  describe("Board Reordering", () => {
    it("allows admin to reorder boards", async () => {
      const boardsRes = await getBoardsForWorkspace(workspace.slug, adminActor, db);
      if (!boardsRes.success || boardsRes.boards.length < 2) return;

      const [first, second] = boardsRes.boards;
      const reorderRes = await reorderBoards(
        workspace.slug,
        {
          items: [
            { id: first.id, sortOrder: 1 },
            { id: second.id, sortOrder: 0 },
          ],
        },
        adminActor,
        db
      );

      expect(reorderRes.success).toBe(true);

      const refreshed = await getBoardsForWorkspace(workspace.slug, adminActor, db);
      if (refreshed.success) {
        expect(refreshed.boards[0].id).toBe(second.id);
        expect(refreshed.boards[1].id).toBe(first.id);
      }
    });
  });
});
