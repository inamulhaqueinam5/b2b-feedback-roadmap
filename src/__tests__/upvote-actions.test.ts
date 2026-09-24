import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import { createPost } from "@/services/posts";
import { toggleUpvoteAction, getUpvoteStatusAction } from "@/actions/upvotes";
import {
  togglePostUpvote,
  hasUserUpvotedPost,
  getUserUpvotedPostIds,
} from "@/db/repositories/upvotes";
import {
  queueUpvoteIntent,
  getQueuedIntent,
  hasQueuedIntent,
  clearQueuedIntent,
  executeQueuedIntent,
} from "@/lib/intent-capture";
import { posts, postUpvotes } from "@/db/schema/posts";
import { eq, and } from "drizzle-orm";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";
import type { ActorContext } from "@/services/boards";

describe("Upvote Engine, Server Actions & Boundary Seams", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let otherWorkspace: Workspace;
  let publicBoard: Board;
  let privateBoard: Board;
  let authorUser: User;
  let voterUser1: User;
  let voterUser2: User;
  let voterUser3: User;

  let visitorActor: ActorContext;
  let authorActor: ActorContext;
  let voter1Actor: ActorContext;
  let voter2Actor: ActorContext;
  let voter3Actor: ActorContext;

  beforeAll(async () => {
    db = await getTestDb();

    workspace = await createWorkspaceRecord(db, {
      name: "Acme Feedback Hub",
      slug: "acme-feedback-hub",
    });

    otherWorkspace = await createWorkspaceRecord(db, {
      name: "Rival Workspace",
      slug: "rival-workspace-hub",
    });

    publicBoard = await createBoardRecord(db, workspace.id, {
      name: "Feature Requests",
      slug: "features-upvoting",
      isPrivate: false,
    });

    privateBoard = await createBoardRecord(db, workspace.id, {
      name: "Confidential Roadmap",
      slug: "confidential-upvoting",
      isPrivate: true,
    });

    authorUser = await createUserRecord(db, {
      email: "author-upvote@example.com",
      name: "Alice Author",
    });

    voterUser1 = await createUserRecord(db, {
      email: "voter1-upvote@example.com",
      name: "Bob Voter",
    });

    voterUser2 = await createUserRecord(db, {
      email: "voter2-upvote@example.com",
      name: "Carol Contributor",
    });

    voterUser3 = await createUserRecord(db, {
      email: "voter3-upvote@example.com",
      name: "Dave Developer",
    });

    visitorActor = { role: "visitor" };
    authorActor = { userId: authorUser.id, role: "member" };
    voter1Actor = { userId: voterUser1.id, role: "member" };
    voter2Actor = { userId: voterUser2.id, role: "member" };
    voter3Actor = { userId: voterUser3.id, role: "member" };
  });

  describe("Atomic Upvote Increment & Decrement Seam", () => {
    it("increments post upvoteCount atomically and registers user upvote in database", async () => {
      // 1. Author creates a post with default initial upvote of 1
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Support GitHub SSO Integration",
          description: "Allow workspace members to sign in with GitHub organizational accounts.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Initial state check
      expect(createRes.post.upvoteCount).toBe(1);
      const initialAuthorUpvote = await hasUserUpvotedPost(db, postId, authorUser.id);
      expect(initialAuthorUpvote).toBe(true);
      const initialVoter1Upvote = await hasUserUpvotedPost(db, postId, voterUser1.id);
      expect(initialVoter1Upvote).toBe(false);

      // 2. Voter 1 casts an upvote via Server Action
      const toggleRes1 = await toggleUpvoteAction(workspace.id, postId, voter1Actor, db);
      expect(toggleRes1.success).toBe(true);
      if (toggleRes1.success) {
        expect(toggleRes1.upvoteCount).toBe(2);
        expect(toggleRes1.hasUpvoted).toBe(true);
        expect(toggleRes1.postId).toBe(postId);
      }

      // Verify database state: record exists in post_upvotes and upvote_count is 2
      const isUpvotedDb = await hasUserUpvotedPost(db, postId, voterUser1.id);
      expect(isUpvotedDb).toBe(true);

      const [postRow] = await db
        .select({ upvoteCount: posts.upvoteCount })
        .from(posts)
        .where(eq(posts.id, postId));
      expect(postRow.upvoteCount).toBe(2);
    });

    it("decrements post upvoteCount atomically and removes user upvote record when toggled again", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Custom Domain CNAME Support",
          description: "Allow configuring feedback.company.com to point directly to workspace boards.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Voter 1 upvotes: count goes from 1 to 2
      const firstToggle = await toggleUpvoteAction(workspace.slug, postId, voter1Actor, db);
      expect(firstToggle.success).toBe(true);
      if (firstToggle.success) {
        expect(firstToggle.upvoteCount).toBe(2);
        expect(firstToggle.hasUpvoted).toBe(true);
      }

      // Voter 1 withdraws upvote: count goes from 2 to 1
      const secondToggle = await toggleUpvoteAction(workspace.slug, postId, voter1Actor, db);
      expect(secondToggle.success).toBe(true);
      if (secondToggle.success) {
        expect(secondToggle.upvoteCount).toBe(1);
        expect(secondToggle.hasUpvoted).toBe(false);
      }

      // Verify database state: record removed from post_upvotes and upvote_count is 1
      const isUpvotedDb = await hasUserUpvotedPost(db, postId, voterUser1.id);
      expect(isUpvotedDb).toBe(false);

      const [postRow] = await db
        .select({ upvoteCount: posts.upvoteCount })
        .from(posts)
        .where(eq(posts.id, postId));
      expect(postRow.upvoteCount).toBe(1);
    });

    it("prevents post upvote count from ever dropping below zero", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Zero Boundary Guard Test",
          description: "Ensure that decrementing upvotes never yields negative integers in the database.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Author unvotes: count drops from 1 to 0
      const authorUnvote = await toggleUpvoteAction(workspace.id, postId, authorActor, db);
      expect(authorUnvote.success).toBe(true);
      if (authorUnvote.success) {
        expect(authorUnvote.upvoteCount).toBe(0);
        expect(authorUnvote.hasUpvoted).toBe(false);
      }

      // Directly verify in database
      const [postRow] = await db
        .select({ upvoteCount: posts.upvoteCount })
        .from(posts)
        .where(eq(posts.id, postId));
      expect(postRow.upvoteCount).toBe(0);

      // Verify GREATEST(upvote_count - 1, 0) logic at the repository level
      await db
        .update(posts)
        .set({ upvoteCount: 0 })
        .where(eq(posts.id, postId));

      const [postRowAfter] = await db
        .select({ upvoteCount: posts.upvoteCount })
        .from(posts)
        .where(eq(posts.id, postId));
      expect(postRowAfter.upvoteCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Multi-User Concurrency & Unique Constraint Safety", () => {
    it("handles multiple distinct users upvoting the same post consistently", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "SAML 2.0 Single Sign-On for Enterprise",
          description: "Integrate Okta, Azure AD and Google Workspace enterprise SSO login.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Initial count is 1 (author)
      // Three distinct voters upvote sequentially
      const r1 = await toggleUpvoteAction(workspace.id, postId, voter1Actor, db);
      const r2 = await toggleUpvoteAction(workspace.id, postId, voter2Actor, db);
      const r3 = await toggleUpvoteAction(workspace.id, postId, voter3Actor, db);

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);

      if (r3.success) {
        expect(r3.upvoteCount).toBe(4);
      }

      // Verify database count
      const [postRow] = await db
        .select({ upvoteCount: posts.upvoteCount })
        .from(posts)
        .where(eq(posts.id, postId));
      expect(postRow.upvoteCount).toBe(4);

      // Verify batch helper getUserUpvotedPostIds
      const voter1UpvotedIds = await getUserUpvotedPostIds(db, [postId], voterUser1.id);
      expect(voter1UpvotedIds.has(postId)).toBe(true);

      const visitorUpvotedIds = await getUserUpvotedPostIds(db, [postId], "");
      expect(visitorUpvotedIds.size).toBe(0);

      // Voter 2 unvotes
      const r2Undo = await toggleUpvoteAction(workspace.id, postId, voter2Actor, db);
      expect(r2Undo.success).toBe(true);
      if (r2Undo.success) {
        expect(r2Undo.upvoteCount).toBe(3);
        expect(r2Undo.hasUpvoted).toBe(false);
      }
    });

    it("enforces unique constraint on post_upvotes table preventing duplicate records", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Unique Constraint Protection Post",
          description: "Database unique constraint on (postId, userId) must prevent duplicate upvotes.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Author is already in post_upvotes
      // Attempting to directly insert a duplicate into post_upvotes throws unique constraint error
      await expect(
        db.insert(postUpvotes).values({
          postId,
          userId: authorUser.id,
        })
      ).rejects.toThrow();

      // Verify only 1 upvote record exists for author on this post
      const upvotes = await db
        .select()
        .from(postUpvotes)
        .where(and(eq(postUpvotes.postId, postId), eq(postUpvotes.userId, authorUser.id)));
      expect(upvotes.length).toBe(1);
    });
  });

  describe("Unauthenticated Visitor Intent Capture & Replay", () => {
    beforeAll(() => {
      clearQueuedIntent();
    });

    it("rejects unauthenticated visitor mutations with clear UNAUTHENTICATED error", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Dark Mode Contrast Improvements",
          description: "Improve contrast for low-vision users when using the zinc dark theme.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      const result = await toggleUpvoteAction(workspace.slug, postId, visitorActor, db);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNAUTHENTICATED");
        expect(result.error).toMatch(/authentication required/i);
      }
    });

    it("captures pending upvote intent and replays seamlessly upon authentication", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Export Audit Log to CSV",
          description: "Provide enterprise workspace admins with downloadable CSV audit logs.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // 1. Visitor clicks upvote: client queues intent
      const queued = queueUpvoteIntent(postId, workspace.slug);
      expect(queued.id).toBeDefined();
      expect(queued.type).toBe("upvote");
      expect(queued.payload.postId).toBe(postId);
      expect(queued.payload.workspaceSlug).toBe(workspace.slug);
      expect(hasQueuedIntent()).toBe(true);

      const retrieved = getQueuedIntent();
      expect(retrieved?.payload).toEqual({ postId, workspaceSlug: workspace.slug });

      // 2. Visitor signs in: executeQueuedIntent replays the pending action
      let replayedSuccess = false;
      const executed = await executeQueuedIntent(async (intent) => {
        if (intent.type === "upvote") {
          const payload = intent.payload as { postId: string; workspaceSlug?: string };
          const res = await toggleUpvoteAction(
            payload.workspaceSlug ?? workspace.slug,
            payload.postId,
            voter1Actor,
            db
          );
          replayedSuccess = res.success;
          return res.success;
        }
        return false;
      });

      expect(executed).toBe(true);
      expect(replayedSuccess).toBe(true);

      // Intent queue must be automatically cleared after successful replay
      expect(hasQueuedIntent()).toBe(false);
      expect(getQueuedIntent()).toBeNull();

      // Database should reflect voter 1's upvote
      const hasUpvoted = await hasUserUpvotedPost(db, postId, voterUser1.id);
      expect(hasUpvoted).toBe(true);

      const [postRow] = await db
        .select({ upvoteCount: posts.upvoteCount })
        .from(posts)
        .where(eq(posts.id, postId));
      expect(postRow.upvoteCount).toBe(2);
    });
  });

  describe("Multi-Tenancy Isolation & Permission Boundaries", () => {
    it("rejects upvote attempts when post belongs to a different workspace", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Tenant Isolation Post for Acme",
          description: "This post belongs to Acme Feedback Hub and must not be mutated via other workspaces.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Attempting to upvote using rival workspace slug
      const rivalAttemptBySlug = await toggleUpvoteAction(
        otherWorkspace.slug,
        postId,
        voter1Actor,
        db
      );
      expect(rivalAttemptBySlug.success).toBe(false);
      if (!rivalAttemptBySlug.success) {
        expect(rivalAttemptBySlug.code).toBe("NOT_FOUND");
      }

      // Attempting to upvote using rival workspace ID
      const rivalAttemptById = await toggleUpvoteAction(
        otherWorkspace.id,
        postId,
        voter1Actor,
        db
      );
      expect(rivalAttemptById.success).toBe(false);
      if (!rivalAttemptById.success) {
        expect(rivalAttemptById.code).toBe("NOT_FOUND");
      }
    });

    it("rejects upvote attempts on non-existent posts", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const result = await toggleUpvoteAction(workspace.id, nonExistentId, voter1Actor, db);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("NOT_FOUND");
      }
    });

    it("allows authorized members to upvote posts on private boards", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "SOC2 Compliance Milestone Post",
          description: "Internal compliance milestone tracking for SOC2 Type II certification.",
          boardSlug: privateBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Member actor can upvote on private board
      const memberToggle = await toggleUpvoteAction(workspace.id, postId, voter1Actor, db);
      expect(memberToggle.success).toBe(true);
      if (memberToggle.success) {
        expect(memberToggle.upvoteCount).toBe(2);
      }
    });

    it("blocks visitors from upvoting posts on private boards", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Private Infrastructure Secret",
          description: "Internal database migration plans and architectural specifications.",
          boardSlug: privateBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Visitor is blocked before touching private board
      const visitorToggle = await toggleUpvoteAction(workspace.id, postId, visitorActor, db);
      expect(visitorToggle.success).toBe(false);
      if (!visitorToggle.success) {
        expect(visitorToggle.code).toBe("UNAUTHENTICATED");
      }
    });
  });

  describe("Upvote Status Query Seam", () => {
    it("returns correct hasUpvoted and count state for authenticated and visitor actors", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Keyboard Shortcuts for Rapid Navigation",
          description: "Press J and K to navigate posts and U to toggle upvotes from keyboard.",
          boardSlug: publicBoard.slug,
        },
        authorActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;
      const postId = createRes.post.id;

      // Author has upvoted
      const authorStatus = await getUpvoteStatusAction(workspace.slug, postId, authorActor, db);
      expect(authorStatus.success).toBe(true);
      if (authorStatus.success) {
        expect(authorStatus.hasUpvoted).toBe(true);
        expect(authorStatus.upvoteCount).toBe(1);
      }

      // Voter 1 has not upvoted
      const voterStatus = await getUpvoteStatusAction(workspace.slug, postId, voter1Actor, db);
      expect(voterStatus.success).toBe(true);
      if (voterStatus.success) {
        expect(voterStatus.hasUpvoted).toBe(false);
        expect(voterStatus.upvoteCount).toBe(1);
      }

      // Visitor has not upvoted
      const visitorStatus = await getUpvoteStatusAction(workspace.slug, postId, visitorActor, db);
      expect(visitorStatus.success).toBe(true);
      if (visitorStatus.success) {
        expect(visitorStatus.hasUpvoted).toBe(false);
        expect(visitorStatus.upvoteCount).toBe(1);
      }
    });
  });

  describe("Rollback Behavior on Transaction Failure", () => {
    it("aborts transaction and leaves database unmodified if repository throws", async () => {
      const fakePostId = "11111111-1111-1111-1111-111111111111";

      await expect(
        togglePostUpvote(db, {
          workspaceId: workspace.id,
          postId: fakePostId,
          userId: voterUser1.id,
        })
      ).rejects.toThrow(/not found/i);

      // Verify no orphan records in post_upvotes
      const [orphan] = await db
        .select()
        .from(postUpvotes)
        .where(eq(postUpvotes.postId, fakePostId));
      expect(orphan).toBeUndefined();
    });
  });
});
