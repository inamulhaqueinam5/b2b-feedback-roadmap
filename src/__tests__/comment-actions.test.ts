import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import { createPostWithInitialUpvote } from "@/db/repositories/posts";
import {
  createComment as createCommentRecord,
  findCommentById,
} from "@/db/repositories/comments";
import { addWorkspaceMember } from "@/services/auth";
import {
  createCommentAction,
  updateCommentAction,
  deleteCommentAction,
  getPostCommentsAction,
} from "@/actions/comments";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";
import type { Post } from "@/db/schema/posts";
import type { ActorContext } from "@/services/boards";

describe("Comment Actions & Discussion Seams", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let otherWorkspace: Workspace;
  let board: Board;
  let post: Post;
  let otherPost: Post;

  let ownerUser: User;
  let adminUser: User;
  let authorUser: User;
  let otherUser: User;

  let visitorActor: ActorContext;
  let ownerActor: ActorContext;
  let adminActor: ActorContext;
  let authorActor: ActorContext;
  let otherActor: ActorContext;

  beforeAll(async () => {
    db = await getTestDb();

    workspace = await createWorkspaceRecord(db, {
      name: "Acme Feedback",
      slug: "acme-comments-test",
    });

    otherWorkspace = await createWorkspaceRecord(db, {
      name: "Different Tenant",
      slug: "different-comments-tenant",
    });

    board = await createBoardRecord(db, workspace.id, {
      name: "Product Ideas",
      slug: "product-ideas",
      isPrivate: false,
    });

    const otherBoard = await createBoardRecord(db, otherWorkspace.id, {
      name: "Other Ideas",
      slug: "other-ideas",
      isPrivate: false,
    });

    ownerUser = await createUserRecord(db, {
      name: "Olivia Owner",
      email: "owner@acme.test",
    });
    await addWorkspaceMember(workspace.id, ownerUser.id, "owner", db);

    adminUser = await createUserRecord(db, {
      name: "Adam Admin",
      email: "admin@acme.test",
    });
    await addWorkspaceMember(workspace.id, adminUser.id, "admin", db);

    authorUser = await createUserRecord(db, {
      name: "Alice Author",
      email: "author@customer.test",
    });
    await addWorkspaceMember(workspace.id, authorUser.id, "member", db);

    otherUser = await createUserRecord(db, {
      name: "Bob Bystander",
      email: "bob@customer.test",
    });
    await addWorkspaceMember(workspace.id, otherUser.id, "member", db);

    post = await createPostWithInitialUpvote(db, {
      workspaceId: workspace.id,
      boardId: board.id,
      authorId: authorUser.id,
      title: "Add CSV Export for Metrics",
      description: "We need to export monthly summary reports in standard CSV spreadsheets.",
    });

    otherPost = await createPostWithInitialUpvote(db, {
      workspaceId: otherWorkspace.id,
      boardId: otherBoard.id,
      authorId: otherUser.id,
      title: "Isolated Post in Other Workspace",
      description: "This post belongs to an entirely separate tenant space.",
    });

    visitorActor = { role: "visitor" };
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
    authorActor = {
      userId: authorUser.id,
      role: "member",
      user: { id: authorUser.id, name: authorUser.name, email: authorUser.email },
    };
    otherActor = {
      userId: otherUser.id,
      role: "member",
      user: { id: otherUser.id, name: otherUser.name, email: otherUser.email },
    };
  });

  describe("Authentication & Input Validation", () => {
    it("blocks unauthenticated visitors from submitting comments", async () => {
      const res = await createCommentAction(
        workspace.id,
        post.id,
        "Visitor comment attempt",
        visitorActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("UNAUTHENTICATED");
        expect(res.error).toMatch(/authentication required/i);
      }
    });

    it("rejects empty comment submission", async () => {
      const res = await createCommentAction(
        workspace.id,
        post.id,
        "   ",
        authorActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("VALIDATION_ERROR");
        expect(res.error).toMatch(/cannot be empty/i);
      }
    });

    it("rejects comment submission exceeding 5000 characters", async () => {
      const oversized = "a".repeat(5001);
      const res = await createCommentAction(
        workspace.id,
        post.id,
        oversized,
        authorActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.code).toBe("VALIDATION_ERROR");
        expect(res.error).toMatch(/cannot exceed 5000 characters/i);
      }
    });
  });

  describe("Comment Creation & Team Badge Attribution", () => {
    it("allows authenticated member to create comment without Team badge", async () => {
      const res = await createCommentAction(
        workspace.id,
        post.id,
        "Here is a workaround using our current reporting dashboard.",
        authorActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.comment.content).toBe(
          "Here is a workaround using our current reporting dashboard."
        );
        expect(res.comment.authorId).toBe(authorUser.id);
        expect(res.comment.isTeamMember).toBe(false);
        expect(res.comment.canEdit).toBe(true);
        expect(res.comment.canDelete).toBe(true);
      }
    });

    it("attaches Team badge flag when workspace admin posts comment", async () => {
      const res = await createCommentAction(
        workspace.id,
        post.id,
        "We have scheduled this feature for the next sprint.",
        adminActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.comment.content).toBe(
          "We have scheduled this feature for the next sprint."
        );
        expect(res.comment.authorId).toBe(adminUser.id);
        expect(res.comment.isTeamMember).toBe(true);
      }
    });

    it("attaches Team badge flag when workspace owner posts comment", async () => {
      const res = await createCommentAction(
        workspace.id,
        post.id,
        "Official update from the founder: this is approved.",
        ownerActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.comment.isTeamMember).toBe(true);
      }
    });
  });

  describe("Chronological Retrieval & Team Badges", () => {
    it("returns public comments ordered chronologically with author information and team badges", async () => {
      const res = await getPostCommentsAction(workspace.id, post.id, visitorActor, db);

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.comments.length).toBeGreaterThanOrEqual(3);

        // Verify chronological order (ascending timestamps)
        for (let i = 1; i < res.comments.length; i++) {
          const prevTime = new Date(res.comments[i - 1].createdAt).getTime();
          const currTime = new Date(res.comments[i].createdAt).getTime();
          expect(currTime).toBeGreaterThanOrEqual(prevTime);
        }

        // Verify author metadata
        const authorComment = res.comments.find(
          (c) => c.authorId === authorUser.id
        );
        expect(authorComment).toBeDefined();
        expect(authorComment?.author.name).toBe("Alice Author");
        expect(authorComment?.isTeamMember).toBe(false);

        const adminComment = res.comments.find(
          (c) => c.authorId === adminUser.id
        );
        expect(adminComment).toBeDefined();
        expect(adminComment?.author.name).toBe("Adam Admin");
        expect(adminComment?.isTeamMember).toBe(true);
      }
    });
  });

  describe("Author 15-Minute Edit & Delete Window", () => {
    it("allows author to update comment within 15 minutes of creation", async () => {
      const createRes = await createCommentAction(
        workspace.id,
        post.id,
        "Initial text with typo",
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const commentId = createRes.comment.id;

      const updateRes = await updateCommentAction(
        workspace.id,
        commentId,
        "Corrected text without typo",
        authorActor,
        db
      );

      expect(updateRes.success).toBe(true);
      if (updateRes.success) {
        expect(updateRes.comment.content).toBe("Corrected text without typo");
      }
    });

    it("rejects author edit attempt when comment is older than 15 minutes", async () => {
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
      const oldComment = await createCommentRecord(db, {
        postId: post.id,
        authorId: authorUser.id,
        content: "Original comment created 20 minutes ago",
        createdAt: twentyMinsAgo,
      });

      const updateRes = await updateCommentAction(
        workspace.id,
        oldComment.id,
        "Attempting to edit after 20 minutes",
        authorActor,
        db
      );

      expect(updateRes.success).toBe(false);
      if (!updateRes.success) {
        expect(updateRes.code).toBe("TIME_LIMIT_EXCEEDED");
        expect(updateRes.error).toMatch(/15 minutes/i);
      }
    });

    it("allows author to delete comment within 15 minutes of creation", async () => {
      const createRes = await createCommentAction(
        workspace.id,
        post.id,
        "Accidental comment to be deleted",
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const commentId = createRes.comment.id;

      const deleteRes = await deleteCommentAction(
        workspace.id,
        commentId,
        authorActor,
        db
      );

      expect(deleteRes.success).toBe(true);

      const record = await findCommentById(db, commentId);
      expect(record).toBeNull();
    });

    it("rejects author delete attempt when comment is older than 15 minutes", async () => {
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
      const oldComment = await createCommentRecord(db, {
        postId: post.id,
        authorId: authorUser.id,
        content: "Comment posted 20 minutes ago that author wants to retract",
        createdAt: twentyMinsAgo,
      });

      const deleteRes = await deleteCommentAction(
        workspace.id,
        oldComment.id,
        authorActor,
        db
      );

      expect(deleteRes.success).toBe(false);
      if (!deleteRes.success) {
        expect(deleteRes.code).toBe("TIME_LIMIT_EXCEEDED");
        expect(deleteRes.error).toMatch(/15 minutes/i);
      }

      const stillExists = await findCommentById(db, oldComment.id);
      expect(stillExists).not.toBeNull();
    });
  });

  describe("Admin Moderation Override", () => {
    it("allows admin to delete any comment at any time even past 15 minutes", async () => {
      const fortyMinsAgo = new Date(Date.now() - 40 * 60 * 1000);
      const expiredComment = await createCommentRecord(db, {
        postId: post.id,
        authorId: authorUser.id,
        content: "Inappropriate comment from regular user posted 40 mins ago",
        createdAt: fortyMinsAgo,
      });

      const adminDeleteRes = await deleteCommentAction(
        workspace.id,
        expiredComment.id,
        adminActor,
        db
      );

      expect(adminDeleteRes.success).toBe(true);

      const record = await findCommentById(db, expiredComment.id);
      expect(record).toBeNull();
    });

    it("allows admin to edit any comment as a moderator", async () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
      const oldComment = await createCommentRecord(db, {
        postId: post.id,
        authorId: authorUser.id,
        content: "Contains sensitive information to be redacted",
        createdAt: thirtyMinsAgo,
      });

      const adminEditRes = await updateCommentAction(
        workspace.id,
        oldComment.id,
        "[Content redacted by moderator]",
        adminActor,
        db
      );

      expect(adminEditRes.success).toBe(true);
      if (adminEditRes.success) {
        expect(adminEditRes.comment.content).toBe(
          "[Content redacted by moderator]"
        );
      }
    });
  });

  describe("Permissions & Security Boundaries", () => {
    it("prevents non-author non-admin user from editing another user's comment", async () => {
      const createRes = await createCommentAction(
        workspace.id,
        post.id,
        "Author comment",
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const editRes = await updateCommentAction(
        workspace.id,
        createRes.comment.id,
        "Malicious overwrite attempt",
        otherActor,
        db
      );

      expect(editRes.success).toBe(false);
      if (!editRes.success) {
        expect(editRes.code).toBe("FORBIDDEN");
      }
    });

    it("prevents non-author non-admin user from deleting another user's comment", async () => {
      const createRes = await createCommentAction(
        workspace.id,
        post.id,
        "Author comment to keep",
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const deleteRes = await deleteCommentAction(
        workspace.id,
        createRes.comment.id,
        otherActor,
        db
      );

      expect(deleteRes.success).toBe(false);
      if (!deleteRes.success) {
        expect(deleteRes.code).toBe("FORBIDDEN");
      }
    });

    it("strictly isolates comments between different workspaces", async () => {
      // Trying to comment on otherPost (which belongs to otherWorkspace) via workspace.id
      const crossWorkspaceRes = await createCommentAction(
        workspace.id,
        otherPost.id,
        "Cross tenant comment attempt",
        authorActor,
        db
      );

      expect(crossWorkspaceRes.success).toBe(false);
      if (!crossWorkspaceRes.success) {
        expect(crossWorkspaceRes.code).toBe("NOT_FOUND");
      }
    });

    it("accepts workspace slug in place of workspace id", async () => {
      const res = await createCommentAction(
        workspace.slug,
        post.id,
        "Comment submitted using workspace slug identifier",
        authorActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.comment.content).toBe(
          "Comment submitted using workspace slug identifier"
        );
      }
    });
  });
});
