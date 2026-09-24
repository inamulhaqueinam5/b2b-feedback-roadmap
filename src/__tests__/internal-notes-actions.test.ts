import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import { createPostWithInitialUpvote } from "@/db/repositories/posts";
import { addWorkspaceMember } from "@/services/auth";
import {
  createInternalNoteAction,
  getInternalNotesAction,
  updatePostAssociatedMrrAction,
} from "@/actions/internal-notes";
import {
  createCommentAction,
  getPostCommentsAction,
} from "@/actions/comments";
import {
  getPostDetailAction,
  getPostsForBoardAction,
} from "@/actions/posts";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";
import type { Post } from "@/db/schema/posts";
import type { ActorContext } from "@/services/boards";

describe("Private Internal Notes & Customer Revenue Weighting Seams", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let otherWorkspace: Workspace;
  let board: Board;
  let otherBoard: Board;
  let post: Post;
  let otherPost: Post;

  let ownerUser: User;
  let adminUser: User;
  let memberUser: User;
  let guestUser: User;
  let visitorUser: User;

  let ownerActor: ActorContext;
  let adminActor: ActorContext;
  let memberActor: ActorContext;
  let guestActor: ActorContext;
  let visitorActor: ActorContext;

  beforeAll(async () => {
    db = await getTestDb();

    workspace = await createWorkspaceRecord(db, {
      name: "Enterprise SaaS Portal",
      slug: "enterprise-portal",
    });

    otherWorkspace = await createWorkspaceRecord(db, {
      name: "Different Tenant Space",
      slug: "different-tenant-space",
    });

    board = await createBoardRecord(db, workspace.id, {
      name: "Core Features",
      slug: "core-features",
      isPrivate: false,
    });

    otherBoard = await createBoardRecord(db, otherWorkspace.id, {
      name: "Other Features",
      slug: "other-features",
      isPrivate: false,
    });

    ownerUser = await createUserRecord(db, {
      name: "Oliver Owner",
      email: "owner@enterprise.test",
    });
    await addWorkspaceMember(workspace.id, ownerUser.id, "owner", db);

    adminUser = await createUserRecord(db, {
      name: "Alice Admin",
      email: "admin@enterprise.test",
    });
    await addWorkspaceMember(workspace.id, adminUser.id, "admin", db);

    memberUser = await createUserRecord(db, {
      name: "Martin Member",
      email: "member@customer.test",
    });
    await addWorkspaceMember(workspace.id, memberUser.id, "member", db);

    guestUser = await createUserRecord(db, {
      name: "Gina Guest",
      email: "guest@external.test",
    });
    await addWorkspaceMember(workspace.id, guestUser.id, "guest", db);

    visitorUser = await createUserRecord(db, {
      name: "Victor Visitor",
      email: "visitor@anonymous.test",
    });

    post = await createPostWithInitialUpvote(db, {
      workspaceId: workspace.id,
      boardId: board.id,
      authorId: memberUser.id,
      title: "Add Automated Multi-Region Data Backups",
      description: "We need daily cross-cloud automated backups to maintain SOC2 compliance requirements.",
    });

    otherPost = await createPostWithInitialUpvote(db, {
      workspaceId: otherWorkspace.id,
      boardId: otherBoard.id,
      authorId: ownerUser.id,
      title: "Foreign Workspace Post",
      description: "This post strictly belongs to another tenant database workspace partition.",
    });

    ownerActor = {
      userId: ownerUser.id,
      role: "owner",
      user: { id: ownerUser.id, name: ownerUser.name, email: ownerUser.email },
    };

    adminActor = {
      userId: adminUser.id,
      role: "admin",
      user: { id: adminUser.id, name: adminUser.name, email: adminUser.email },
    };

    memberActor = {
      userId: memberUser.id,
      role: "member",
      user: { id: memberUser.id, name: memberUser.name, email: memberUser.email },
    };

    guestActor = {
      userId: guestUser.id,
      role: "guest",
      user: { id: guestUser.id, name: guestUser.name, email: guestUser.email },
    };

    visitorActor = {
      role: "visitor",
    };
  });

  describe("Admin Internal Notes Creation & Retrieval", () => {
    it("allows workspace owner to create private internal notes", async () => {
      const res = await createInternalNoteAction(
        workspace.id,
        post.id,
        "Customer BigCo is demanding this feature before renewing their annual contract.",
        ownerActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.note.isInternalNote).toBe(true);
        expect(res.note.isSystemAudit).toBe(false);
        expect(res.note.authorId).toBe(ownerUser.id);
        expect(res.note.author.name).toBe("Oliver Owner");
        expect(res.note.content).toBe(
          "Customer BigCo is demanding this feature before renewing their annual contract."
        );
      }
    });

    it("allows workspace admin to create private internal notes", async () => {
      const res = await createInternalNoteAction(
        workspace.id,
        post.id,
        "Engineering estimate: 2 sprints for multi-region replication setup.",
        adminActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.note.isInternalNote).toBe(true);
        expect(res.note.authorId).toBe(adminUser.id);
        expect(res.note.content).toBe(
          "Engineering estimate: 2 sprints for multi-region replication setup."
        );
      }
    });

    it("allows admin and owner to retrieve all internal notes for a post", async () => {
      const res = await getInternalNotesAction(
        workspace.id,
        post.id,
        adminActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.notes.length).toBeGreaterThanOrEqual(2);
        for (const note of res.notes) {
          expect(note.isInternalNote).toBe(true);
          expect(note.postId).toBe(post.id);
        }

        // Chronological order verification
        for (let i = 1; i < res.notes.length; i++) {
          const prevTime = new Date(res.notes[i - 1].createdAt).getTime();
          const currTime = new Date(res.notes[i].createdAt).getTime();
          expect(currTime).toBeGreaterThanOrEqual(prevTime);
        }
      }
    });

    it("accepts workspace slug interchangeably with workspace UUID", async () => {
      const res = await createInternalNoteAction(
        workspace.slug,
        post.id,
        "Created note using workspace slug identifier.",
        adminActor,
        db
      );

      expect(res.success).toBe(true);
      if (!res.success) return;

      expect(res.note.content).toBe("Created note using workspace slug identifier.");

      const getRes = await getInternalNotesAction(
        workspace.slug,
        post.id,
        ownerActor,
        db
      );
      expect(getRes.success).toBe(true);
      if (getRes.success) {
        const found = getRes.notes.find((n) => n.id === res.note.id);
        expect(found).toBeDefined();
      }
    });
  });

  describe("Strict RBAC Boundaries for Internal Notes", () => {
    it("blocks unauthenticated visitor from creating internal notes", async () => {
      const res = await createInternalNoteAction(
        workspace.id,
        post.id,
        "Visitor attempting to post note",
        visitorActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("UNAUTHENTICATED");
        expect(res.error).toMatch(/authentication required/i);
      }
    });

    it("blocks unauthenticated visitor from reading internal notes", async () => {
      const res = await getInternalNotesAction(
        workspace.id,
        post.id,
        visitorActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("UNAUTHENTICATED");
      }
    });

    it("blocks workspace member from creating internal notes", async () => {
      const res = await createInternalNoteAction(
        workspace.id,
        post.id,
        "Member attempting private note submission",
        memberActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("FORBIDDEN");
        expect(res.error).toMatch(/only workspace owners and admins/i);
      }
    });

    it("blocks workspace guest from creating internal notes", async () => {
      const res = await createInternalNoteAction(
        workspace.id,
        post.id,
        "Guest attempting private note submission",
        guestActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("FORBIDDEN");
        expect(res.error).toMatch(/only workspace owners and admins/i);
      }
    });

    it("blocks workspace member from reading internal notes", async () => {
      const res = await getInternalNotesAction(
        workspace.id,
        post.id,
        memberActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("FORBIDDEN");
      }
    });

    it("blocks workspace guest from reading internal notes", async () => {
      const res = await getInternalNotesAction(
        workspace.id,
        post.id,
        guestActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("FORBIDDEN");
      }
    });

    it("rejects non-admin attempt to post internal note via createCommentAction", async () => {
      const res = await createCommentAction(
        workspace.id,
        post.id,
        "Attempting bypass via regular comment action",
        memberActor,
        db
      );

      // Normal comment creation without isInternalNote flag succeeds
      expect(res.success).toBe(true);

      // But calling createComment service directly with isInternalNote: true gets rejected
      const { createComment } = await import("@/services/comments");
      const bypassAttempt = await createComment(
        workspace.id,
        post.id,
        { content: "Sneaky internal note", isInternalNote: true },
        memberActor,
        db
      );

      expect(bypassAttempt.success).toBe(false);
      if (!bypassAttempt.success) {
        expect(bypassAttempt.code).toBe("FORBIDDEN");
      }
    });
  });

  describe("Public Discussion Stream Isolation (Zero Leakage)", () => {
    it("never returns internal notes in getPostCommentsAction for visitors", async () => {
      const res = await getPostCommentsAction(
        workspace.id,
        post.id,
        visitorActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        for (const comment of res.comments) {
          expect(comment.isInternalNote).toBe(false);
        }
      }
    });

    it("never returns internal notes in getPostCommentsAction for members and guests", async () => {
      const memberRes = await getPostCommentsAction(
        workspace.id,
        post.id,
        memberActor,
        db
      );

      expect(memberRes.success).toBe(true);
      if (memberRes.success) {
        for (const comment of memberRes.comments) {
          expect(comment.isInternalNote).toBe(false);
        }
      }

      const guestRes = await getPostCommentsAction(
        workspace.id,
        post.id,
        guestActor,
        db
      );

      expect(guestRes.success).toBe(true);
      if (guestRes.success) {
        for (const comment of guestRes.comments) {
          expect(comment.isInternalNote).toBe(false);
        }
      }
    });

    it("keeps public discussion comments and internal notes strictly separated for admins", async () => {
      // Discussion stream should only contain public discussion comments
      const discussionRes = await getPostCommentsAction(
        workspace.id,
        post.id,
        adminActor,
        db
      );

      expect(discussionRes.success).toBe(true);
      if (discussionRes.success) {
        for (const comment of discussionRes.comments) {
          expect(comment.isInternalNote).toBe(false);
        }
      }

      // Internal notes stream should only contain internal notes
      const notesRes = await getInternalNotesAction(
        workspace.id,
        post.id,
        adminActor,
        db
      );

      expect(notesRes.success).toBe(true);
      if (notesRes.success) {
        for (const note of notesRes.notes) {
          expect(note.isInternalNote).toBe(true);
        }
      }
    });
  });

  describe("Customer Revenue Weighting (Associated MRR)", () => {
    it("allows admin to set numeric associated MRR on a post", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        2500,
        adminActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.associatedMrr).toBe("2500.00");
        expect(res.post.associatedMrr).toBe("2500.00");
      }
    });

    it("allows owner to update associated MRR with decimal value", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        4850.75,
        ownerActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.associatedMrr).toBe("4850.75");
      }
    });

    it("allows admin to pass string formatted numbers and stripped dollar signs", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        "$12500",
        adminActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.associatedMrr).toBe("12500.00");
      }
    });

    it("allows admin to reset associated MRR to zero or null", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        0,
        adminActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.associatedMrr).toBe("0.00");
      }
    });

    it("rejects negative MRR values", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        -500,
        adminActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("VALIDATION_ERROR");
        expect(res.error).toMatch(/positive number/i);
      }
    });

    it("rejects invalid non-numeric strings for MRR", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        "not-a-number",
        adminActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("VALIDATION_ERROR");
      }
    });

    it("blocks workspace member from updating associated MRR", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        5000,
        memberActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("FORBIDDEN");
        expect(res.error).toMatch(/only workspace owners and admins/i);
      }
    });

    it("blocks workspace guest from updating associated MRR", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        5000,
        guestActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("FORBIDDEN");
      }
    });

    it("blocks unauthenticated visitor from updating associated MRR", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        5000,
        visitorActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("UNAUTHENTICATED");
      }
    });
  });

  describe("Confidentiality of Associated MRR in Read Queries", () => {
    beforeAll(async () => {
      // Set confidential MRR on post
      await updatePostAssociatedMrrAction(
        workspace.id,
        post.id,
        7500,
        adminActor,
        db
      );
    });

    it("exposes associated MRR to workspace admin in getPostDetailAction", async () => {
      const res = await getPostDetailAction(workspace.slug, post.id, adminActor, db);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.post.associatedMrr).toBe("7500.00");
      }
    });

    it("exposes associated MRR to workspace owner in getPostDetailAction", async () => {
      const res = await getPostDetailAction(workspace.slug, post.id, ownerActor, db);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.post.associatedMrr).toBe("7500.00");
      }
    });

    it("hides associated MRR from workspace member in getPostDetailAction", async () => {
      const res = await getPostDetailAction(workspace.slug, post.id, memberActor, db);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.post.associatedMrr).toBeNull();
      }
    });

    it("hides associated MRR from workspace guest in getPostDetailAction", async () => {
      const res = await getPostDetailAction(workspace.slug, post.id, guestActor, db);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.post.associatedMrr).toBeNull();
      }
    });

    it("hides associated MRR from unauthenticated visitor in getPostDetailAction", async () => {
      const res = await getPostDetailAction(workspace.slug, post.id, visitorActor, db);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.post.associatedMrr).toBeNull();
      }
    });

    it("hides associated MRR from non-admins in getPostsForBoardAction", async () => {
      const res = await getPostsForBoardAction(
        workspace.slug,
        board.slug,
        undefined,
        memberActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        for (const p of res.posts) {
          expect(p.associatedMrr).toBeNull();
        }
      }
    });
  });

  describe("Multi-Tenancy Isolation", () => {
    it("prevents admin from creating internal notes on another workspace post", async () => {
      const res = await createInternalNoteAction(
        workspace.id,
        otherPost.id,
        "Cross workspace note attack",
        adminActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("NOT_FOUND");
      }
    });

    it("prevents admin from reading internal notes from another workspace post", async () => {
      const res = await getInternalNotesAction(
        workspace.id,
        otherPost.id,
        adminActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("NOT_FOUND");
      }
    });

    it("prevents admin from updating MRR on another workspace post", async () => {
      const res = await updatePostAssociatedMrrAction(
        workspace.id,
        otherPost.id,
        3000,
        adminActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("Input Validation for Internal Notes", () => {
    it("rejects empty internal note submission", async () => {
      const res = await createInternalNoteAction(
        workspace.id,
        post.id,
        "   ",
        adminActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("VALIDATION_ERROR");
        expect(res.error).toMatch(/cannot be empty/i);
      }
    });

    it("rejects internal note exceeding 5000 characters", async () => {
      const oversized = "x".repeat(5001);
      const res = await createInternalNoteAction(
        workspace.id,
        post.id,
        oversized,
        adminActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("VALIDATION_ERROR");
        expect(res.error).toMatch(/cannot exceed 5000 characters/i);
      }
    });
  });
});
