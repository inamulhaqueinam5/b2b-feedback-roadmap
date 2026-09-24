import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import {
  createPost,
  searchDuplicates,
  getPostDetail,
  getPostsForBoard,
} from "@/services/posts";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";
import type { ActorContext } from "@/services/boards";

describe("Post Service & Server Actions Boundaries", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let otherWorkspace: Workspace;
  let publicBoard: Board;
  let privateBoard: Board;
  let authorUser: User;
  let adminUser: User;
  let otherUser: User;

  let visitorActor: ActorContext;
  let authorActor: ActorContext;
  let adminActor: ActorContext;
  let otherActor: ActorContext;

  beforeAll(async () => {
    db = await getTestDb();

    workspace = await createWorkspaceRecord(db, {
      name: "Pulse Feedback",
      slug: "pulse-feedback-actions",
    });

    otherWorkspace = await createWorkspaceRecord(db, {
      name: "Competitor SaaS",
      slug: "competitor-saas-actions",
    });

    publicBoard = await createBoardRecord(db, workspace.id, {
      name: "Feedback",
      slug: "feedback-actions",
      isPrivate: false,
    });

    privateBoard = await createBoardRecord(db, workspace.id, {
      name: "Internal Roadmap",
      slug: "internal-roadmap-actions",
      isPrivate: true,
    });

    const otherBoard = await createBoardRecord(db, otherWorkspace.id, {
      name: "Feedback",
      slug: "feedback-actions-other",
      isPrivate: false,
    });

    authorUser = await createUserRecord(db, {
      email: "author-actions@example.com",
      name: "Dana Submitter",
    });

    adminUser = await createUserRecord(db, {
      email: "admin-actions@example.com",
      name: "Alex Administrator",
    });

    otherUser = await createUserRecord(db, {
      email: "other-actions@example.com",
      name: "Chris Browser",
    });

    visitorActor = { role: "visitor" };
    authorActor = { userId: authorUser.id, role: "member" };
    adminActor = { userId: adminUser.id, role: "admin" };
    otherActor = { userId: otherUser.id, role: "member" };

    // Seed a post in otherWorkspace to test cross-tenant boundary
    await createPost(
      otherWorkspace.slug,
      {
        title: "Realtime webhook notifications in Discord",
        description: "Need discord bot integration for automated workspace channel alerts.",
        boardSlug: otherBoard.slug,
      },
      { userId: otherUser.id, role: "member" },
      db
    );
  });

  describe("Post Creation & Authentication Enforcement", () => {
    it("blocks unauthenticated visitors from submitting feedback", async () => {
      const result = await createPost(
        workspace.slug,
        {
          title: "Public feedback from anonymous guest",
          description: "This should be blocked until the visitor signs in with their credentials.",
          boardSlug: publicBoard.slug,
        },
        visitorActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNAUTHENTICATED");
        expect(result.error).toMatch(/authentication required/i);
      }
    });

    it("rejects post with title shorter than 5 characters", async () => {
      const result = await createPost(
        workspace.slug,
        {
          title: "Fix",
          description: "This description is longer than twenty characters easily.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("VALIDATION_ERROR");
        expect(result.error).toMatch(/at least 5 characters/i);
      }
    });

    it("rejects post with description shorter than 20 characters", async () => {
      const result = await createPost(
        workspace.slug,
        {
          title: "Proper title length here",
          description: "Short desc",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("VALIDATION_ERROR");
        expect(result.error).toMatch(/at least 20 characters/i);
      }
    });

    it("allows authenticated member to create post on public board with initial upvote and subscription", async () => {
      const result = await createPost(
        workspace.slug,
        {
          title: "Realtime webhook notifications in Slack",
          description: "Need slack integration to notify our product engineering team instantly.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.post.title).toBe("Realtime webhook notifications in Slack");
        expect(result.post.status).toBe("open");
        expect(result.post.upvoteCount).toBe(1);
        expect(result.post.authorId).toBe(authorUser.id);
        expect(result.board.id).toBe(publicBoard.id);
        expect(result.workspace.id).toBe(workspace.id);
      }
    });

    it("blocks visitors from submitting to private boards", async () => {
      const result = await createPost(
        workspace.slug,
        {
          title: "Secret internal idea submission",
          description: "Unauthorized visitor trying to submit to private roadmap board.",
          boardSlug: privateBoard.slug,
        },
        visitorActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNAUTHENTICATED");
      }
    });

    it("allows authorized member to submit to private boards", async () => {
      const result = await createPost(
        workspace.slug,
        {
          title: "Q4 Enterprise Security Audit",
          description: "Internal security review and penetration testing for SOC2 certification.",
          boardSlug: privateBoard.slug,
        },
        authorActor,
        db
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.post.title).toBe("Q4 Enterprise Security Audit");
        expect(result.board.id).toBe(privateBoard.id);
      }
    });
  });

  describe("Duplicate Detection Action & Multi-Tenancy", () => {
    it("allows unauthenticated visitors to search duplicate suggestions", async () => {
      const result = await searchDuplicates(
        workspace.slug,
        "slack webhook notifications",
        undefined,
        visitorActor,
        db
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.posts.length).toBeGreaterThan(0);
        expect(result.posts[0].title).toBe("Realtime webhook notifications in Slack");
        expect(result.posts[0].similarity).toBeGreaterThan(0.4);
      }
    });

    it("returns empty array for query shorter than 2 characters", async () => {
      const result = await searchDuplicates(
        workspace.slug,
        "s",
        undefined,
        authorActor,
        db
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.posts).toEqual([]);
      }
    });

    it("never returns suggestions from other workspaces", async () => {
      // "Discord" was only seeded in otherWorkspace
      const resultInWs = await searchDuplicates(
        workspace.slug,
        "webhook notifications Discord",
        undefined,
        authorActor,
        db
      );

      expect(resultInWs.success).toBe(true);
      if (resultInWs.success) {
        for (const post of resultInWs.posts) {
          expect(post.workspaceId).toBe(workspace.id);
          expect(post.title).not.toMatch(/Discord/i);
        }
      }
    });
  });

  describe("Post Detail Action & Interaction States", () => {
    it("returns post details with author upvote and subscription state", async () => {
      // First create a post to test retrieval
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Dark mode for user profile dashboard",
          description: "Improve accessibility for users working in dark environments and at night.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const postId = createRes.post.id;

      // Author inspection: hasUpvoted and isSubscribed should both be true
      const authorView = await getPostDetail(workspace.slug, postId, authorActor, db);
      expect(authorView.success).toBe(true);
      if (authorView.success) {
        expect(authorView.post.id).toBe(postId);
        expect(authorView.hasUpvoted).toBe(true);
        expect(authorView.isSubscribed).toBe(true);
        expect(authorView.author.id).toBe(authorUser.id);
        expect(authorView.board.id).toBe(publicBoard.id);
      }

      // Other user inspection: hasUpvoted and isSubscribed should be false
      const otherView = await getPostDetail(workspace.slug, postId, otherActor, db);
      expect(otherView.success).toBe(true);
      if (otherView.success) {
        expect(otherView.hasUpvoted).toBe(false);
        expect(otherView.isSubscribed).toBe(false);
      }

      // Anonymous visitor inspection: hasUpvoted and isSubscribed should be false
      const visitorView = await getPostDetail(workspace.slug, postId, visitorActor, db);
      expect(visitorView.success).toBe(true);
      if (visitorView.success) {
        expect(visitorView.hasUpvoted).toBe(false);
        expect(visitorView.isSubscribed).toBe(false);
      }
    });

    it("hides posts on private boards from unauthenticated visitors", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Private security review findings",
          description: "Confidential post containing internal audit notes and findings.",
          boardSlug: privateBoard.slug,
        },
        adminActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const postId = createRes.post.id;

      const visitorView = await getPostDetail(workspace.slug, postId, visitorActor, db);
      expect(visitorView.success).toBe(false);
      if (!visitorView.success) {
        expect(visitorView.error).toMatch(/not found/i);
      }

      const adminView = await getPostDetail(workspace.slug, postId, adminActor, db);
      expect(adminView.success).toBe(true);
    });
  });

  describe("Board Posts Listing", () => {
    it("returns posts for public board", async () => {
      const res = await getPostsForBoard(workspace.slug, publicBoard.slug, undefined, visitorActor, db);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.posts.length).toBeGreaterThan(0);
        for (const p of res.posts) {
          expect(p.boardId).toBe(publicBoard.id);
        }
      }
    });

    it("hides posts on private board from unauthorized visitor", async () => {
      const res = await getPostsForBoard(workspace.slug, privateBoard.slug, undefined, visitorActor, db);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(/not found/i);
      }
    });
  });
});
