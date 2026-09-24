import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import { createPost } from "@/services/posts";
import { updatePostStatusAction } from "@/actions/posts";
import { updatePostStatus, canModeratePosts } from "@/services/moderation";
import { getRoadmapAction } from "@/actions/roadmap";
import { getRoadmapCacheTag } from "@/lib/cache-tags";
import { findPostById } from "@/db/repositories/posts";
import { findCommentsByPostId } from "@/db/repositories/comments";
import { getPostCommentsAction } from "@/actions/comments";
import { postStatusEnum, type PostStatus } from "@/db/schema/posts";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";
import type { ActorContext } from "@/services/boards";

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

describe("Admin Moderation, Status Transitions and Audit Trail", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let otherWorkspace: Workspace;
  let board: Board;
  let otherBoard: Board;

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
      name: "Acme Moderation Hub",
      slug: "acme-moderation-hub",
    });

    otherWorkspace = await createWorkspaceRecord(db, {
      name: "Competitor Hub",
      slug: "competitor-hub",
    });

    board = await createBoardRecord(db, workspace.id, {
      name: "Feature Feedback",
      slug: "feature-feedback",
      isPrivate: false,
    });

    otherBoard = await createBoardRecord(db, otherWorkspace.id, {
      name: "Competitor Board",
      slug: "competitor-board",
      isPrivate: false,
    });

    ownerUser = await createUserRecord(db, {
      email: "owner-moderation@example.com",
      name: "Olivia Owner",
    });

    adminUser = await createUserRecord(db, {
      email: "admin-moderation@example.com",
      name: "Adam Admin",
    });

    memberUser = await createUserRecord(db, {
      email: "member-moderation@example.com",
      name: "Mia Member",
    });

    guestUser = await createUserRecord(db, {
      email: "guest-moderation@example.com",
      name: "Gabe Guest",
    });

    visitorUser = await createUserRecord(db, {
      email: "visitor-moderation@example.com",
      name: "Victor Visitor",
    });

    ownerActor = {
      userId: ownerUser.id,
      role: "owner",
      user: ownerUser,
    };

    adminActor = {
      userId: adminUser.id,
      role: "admin",
      user: adminUser,
    };

    memberActor = {
      userId: memberUser.id,
      role: "member",
      user: memberUser,
    };

    guestActor = {
      userId: guestUser.id,
      role: "guest",
      user: guestUser,
    };

    visitorActor = {
      role: "visitor",
    };
  });

  beforeEach(() => {
    revalidatePathMock.mockClear();
    revalidateTagMock.mockClear();
  });

  describe("Lifecycle Status Transitions by Verified Admins", () => {
    it("allows verified admins to transition status across the full lifecycle", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Realtime push notification subscriptions",
          description: "We need instant web push notifications for ticket updates and mentions.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const postId = createRes.post.id;
      expect(createRes.post.status).toBe("open");

      const lifecycleSteps: PostStatus[] = [
        "under_review",
        "planned",
        "in_progress",
        "completed",
        "closed",
        "open",
      ];

      let previousStatus: PostStatus = "open";

      for (const nextStatus of lifecycleSteps) {
        const updateRes = await updatePostStatusAction(
          workspace.id,
          postId,
          nextStatus,
          adminActor,
          db
        );

        expect(updateRes.success).toBe(true);
        if (!updateRes.success) return;

        expect(updateRes.post.status).toBe(nextStatus);
        expect(updateRes.previousStatus).toBe(previousStatus);
        expect(updateRes.newStatus).toBe(nextStatus);
        expect(updateRes.auditComment.isSystemAudit).toBe(true);

        const persisted = await findPostById(db, workspace.id, postId);
        expect(persisted).not.toBeNull();
        expect(persisted?.status).toBe(nextStatus);

        previousStatus = nextStatus;
      }
    });

    it("allows workspace owners to transition post status", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Custom branding support with white label domain",
          description: "Allow enterprise teams to configure custom CNAME domains with TLS.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const updateRes = await updatePostStatusAction(
        workspace.id,
        createRes.post.id,
        "planned",
        ownerActor,
        db
      );

      expect(updateRes.success).toBe(true);
      if (updateRes.success) {
        expect(updateRes.post.status).toBe("planned");
        expect(updateRes.previousStatus).toBe("open");
      }
    });

    it("accepts workspace slug in place of workspace UUID", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Automated CSV data export for metrics",
          description: "Download weekly user suggestions and upvotes as standard CSV files.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const updateRes = await updatePostStatusAction(
        workspace.slug,
        createRes.post.id,
        "under_review",
        adminActor,
        db
      );

      expect(updateRes.success).toBe(true);
      if (updateRes.success) {
        expect(updateRes.post.status).toBe("under_review");
      }
    });
  });

  describe("RBAC Protection and Non-Admin Rejection", () => {
    it("rejects workspace members with FORBIDDEN", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Integrate with Slack incoming webhooks",
          description: "Post new feature ideas directly to dedicated Slack feedback channels.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const updateRes = await updatePostStatusAction(
        workspace.id,
        createRes.post.id,
        "planned",
        memberActor,
        db
      );

      expect(updateRes.success).toBe(false);
      if (!updateRes.success) {
        expect(updateRes.code).toBe("FORBIDDEN");
      }

      const unchangedPost = await findPostById(db, workspace.id, createRes.post.id);
      expect(unchangedPost?.status).toBe("open");
    });

    it("rejects guest users with FORBIDDEN", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Two-factor authentication with authenticator app",
          description: "Support TOTP security keys for user logins and sensitive changes.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const updateRes = await updatePostStatusAction(
        workspace.id,
        createRes.post.id,
        "in_progress",
        guestActor,
        db
      );

      expect(updateRes.success).toBe(false);
      if (!updateRes.success) {
        expect(updateRes.code).toBe("FORBIDDEN");
      }

      const unchangedPost = await findPostById(db, workspace.id, createRes.post.id);
      expect(unchangedPost?.status).toBe("open");
    });

    it("rejects unauthenticated visitors with FORBIDDEN", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Figma embed previews in descriptions",
          description: "Render embedded Figma canvases directly within feedback post details.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const updateRes = await updatePostStatusAction(
        workspace.id,
        createRes.post.id,
        "completed",
        visitorActor,
        db
      );

      expect(updateRes.success).toBe(false);
      if (!updateRes.success) {
        expect(updateRes.code).toBe("FORBIDDEN");
      }

      const undefinedActorRes = await updatePostStatusAction(
        workspace.id,
        createRes.post.id,
        "completed",
        undefined,
        db
      );

      expect(undefinedActorRes.success).toBe(false);
      if (!undefinedActorRes.success) {
        expect(undefinedActorRes.code).toBe("FORBIDDEN");
      }
    });

    it("rejects cross-tenant status modifications", async () => {
      const createOtherRes = await createPost(
        otherWorkspace.slug,
        {
          title: "Confidential feature for competitor platform",
          description: "Exclusive to competitor workspace and not accessible to Acme admins.",
          boardSlug: otherBoard.slug,
        },
        { userId: adminUser.id, role: "member" },
        db
      );

      expect(createOtherRes.success).toBe(true);
      if (!createOtherRes.success) return;

      const updateRes = await updatePostStatusAction(
        workspace.id,
        createOtherRes.post.id,
        "planned",
        adminActor,
        db
      );

      expect(updateRes.success).toBe(false);
      if (!updateRes.success) {
        expect(updateRes.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("Automated System Audit Comments", () => {
    it("creates an automated system audit comment documenting previous and new status", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Dark mode theme toggle with system preference",
          description: "Automatic dark theme detection with manual light and dark overrides.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const postId = createRes.post.id;

      const updateRes1 = await updatePostStatusAction(
        workspace.id,
        postId,
        "planned",
        adminActor,
        db
      );

      expect(updateRes1.success).toBe(true);

      const commentsAfterFirst = await findCommentsByPostId(db, postId);
      expect(commentsAfterFirst.length).toBe(1);

      const firstAudit = commentsAfterFirst[0];
      expect(firstAudit.isSystemAudit).toBe(true);
      expect(firstAudit.isInternalNote).toBe(false);
      expect(firstAudit.authorId).toBe(adminUser.id);
      expect(firstAudit.content).toBe("Changed status from Open to Planned");

      const updateRes2 = await updatePostStatusAction(
        workspace.id,
        postId,
        "in_progress",
        ownerActor,
        db
      );

      expect(updateRes2.success).toBe(true);

      const commentsAfterSecond = await findCommentsByPostId(db, postId);
      expect(commentsAfterSecond.length).toBe(2);

      const secondAudit = commentsAfterSecond[1];
      expect(secondAudit.isSystemAudit).toBe(true);
      expect(secondAudit.authorId).toBe(ownerUser.id);
      expect(secondAudit.content).toBe("Changed status from Planned to In Progress");

      const threadRes = await getPostCommentsAction(workspace.id, postId, visitorActor, db);
      expect(threadRes.success).toBe(true);
      if (threadRes.success) {
        expect(threadRes.comments.length).toBe(2);
        expect(threadRes.comments[0].content).toBe("Changed status from Open to Planned");
        expect(threadRes.comments[1].content).toBe("Changed status from Planned to In Progress");
      }
    });
  });

  describe("Cache Revalidation Triggers", () => {
    it("triggers revalidation for workspace paths and roadmap cache tag", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Public API key management for developers",
          description: "Generate scoped API keys with fine grained read and write permissions.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const postId = createRes.post.id;

      revalidatePathMock.mockClear();
      revalidateTagMock.mockClear();

      const updateRes = await updatePostStatusAction(
        workspace.id,
        postId,
        "planned",
        adminActor,
        db
      );

      expect(updateRes.success).toBe(true);

      expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${workspace.slug}`);
      expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${workspace.slug}/b/${board.slug}`);
      expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${workspace.slug}/roadmap`);
      expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${workspace.slug}/p/${postId}`);

      const expectedRoadmapTag = getRoadmapCacheTag(workspace.id);
      expect(revalidateTagMock).toHaveBeenCalledWith(expectedRoadmapTag);
      expect(revalidateTagMock).toHaveBeenCalledWith(`post:${postId}`);
    });
  });

  describe("Roadmap Reflection Lifecycle", () => {
    it("includes post in roadmap when planned, in_progress or completed and excludes when open or closed", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Interactive kanban roadmap board with drag reordering",
          description: "Drag and drop cards across columns to reorder upcoming priorities.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const postId = createRes.post.id;

      // 1. Initial status: open -> not on roadmap
      const roadmapOpen = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(roadmapOpen.success).toBe(true);
      if (roadmapOpen.success) {
        const allIds = [
          ...roadmapOpen.roadmap.columns.planned.map((c) => c.id),
          ...roadmapOpen.roadmap.columns.inProgress.map((c) => c.id),
          ...roadmapOpen.roadmap.columns.completed.map((c) => c.id),
        ];
        expect(allIds).not.toContain(postId);
      }

      // 2. Transition to planned -> appears in planned column
      await updatePostStatusAction(workspace.id, postId, "planned", adminActor, db);
      const roadmapPlanned = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(roadmapPlanned.success).toBe(true);
      if (roadmapPlanned.success) {
        const plannedIds = roadmapPlanned.roadmap.columns.planned.map((c) => c.id);
        const inProgressIds = roadmapPlanned.roadmap.columns.inProgress.map((c) => c.id);
        const completedIds = roadmapPlanned.roadmap.columns.completed.map((c) => c.id);

        expect(plannedIds).toContain(postId);
        expect(inProgressIds).not.toContain(postId);
        expect(completedIds).not.toContain(postId);
      }

      // 3. Transition to in_progress -> appears in inProgress column
      await updatePostStatusAction(workspace.id, postId, "in_progress", adminActor, db);
      const roadmapInProgress = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(roadmapInProgress.success).toBe(true);
      if (roadmapInProgress.success) {
        const plannedIds = roadmapInProgress.roadmap.columns.planned.map((c) => c.id);
        const inProgressIds = roadmapInProgress.roadmap.columns.inProgress.map((c) => c.id);
        const completedIds = roadmapInProgress.roadmap.columns.completed.map((c) => c.id);

        expect(plannedIds).not.toContain(postId);
        expect(inProgressIds).toContain(postId);
        expect(completedIds).not.toContain(postId);
      }

      // 4. Transition to completed -> appears in completed column
      await updatePostStatusAction(workspace.id, postId, "completed", adminActor, db);
      const roadmapCompleted = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(roadmapCompleted.success).toBe(true);
      if (roadmapCompleted.success) {
        const plannedIds = roadmapCompleted.roadmap.columns.planned.map((c) => c.id);
        const inProgressIds = roadmapCompleted.roadmap.columns.inProgress.map((c) => c.id);
        const completedIds = roadmapCompleted.roadmap.columns.completed.map((c) => c.id);

        expect(plannedIds).not.toContain(postId);
        expect(inProgressIds).not.toContain(postId);
        expect(completedIds).toContain(postId);
      }

      // 5. Transition to closed -> removed from roadmap
      await updatePostStatusAction(workspace.id, postId, "closed", adminActor, db);
      const roadmapClosed = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(roadmapClosed.success).toBe(true);
      if (roadmapClosed.success) {
        const allIds = [
          ...roadmapClosed.roadmap.columns.planned.map((c) => c.id),
          ...roadmapClosed.roadmap.columns.inProgress.map((c) => c.id),
          ...roadmapClosed.roadmap.columns.completed.map((c) => c.id),
        ];
        expect(allIds).not.toContain(postId);
      }

      // 6. Transition back to open -> remains excluded from roadmap
      await updatePostStatusAction(workspace.id, postId, "open", adminActor, db);
      const roadmapOpenAgain = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(roadmapOpenAgain.success).toBe(true);
      if (roadmapOpenAgain.success) {
        const allIds = [
          ...roadmapOpenAgain.roadmap.columns.planned.map((c) => c.id),
          ...roadmapOpenAgain.roadmap.columns.inProgress.map((c) => c.id),
          ...roadmapOpenAgain.roadmap.columns.completed.map((c) => c.id),
        ];
        expect(allIds).not.toContain(postId);
      }
    });
  });

  describe("Validation and Edge Cases", () => {
    it("rejects invalid status values with VALIDATION_ERROR", async () => {
      const createRes = await createPost(
        workspace.slug,
        {
          title: "Multi factor biometric security validation",
          description: "Support WebAuthn TouchID and YubiKey security authenticators.",
          boardSlug: board.slug,
        },
        memberActor,
        db
      );

      expect(createRes.success).toBe(true);
      if (!createRes.success) return;

      const updateRes = await updatePostStatusAction(
        workspace.id,
        createRes.post.id,
        "invalid_status" as PostStatus,
        adminActor,
        db
      );

      expect(updateRes.success).toBe(false);
      if (!updateRes.success) {
        expect(updateRes.code).toBe("VALIDATION_ERROR");
      }
    });

    it("returns NOT_FOUND when updating non-existent post", async () => {
      const nonExistentPostId = "00000000-0000-0000-0000-000000000000";
      const updateRes = await updatePostStatusAction(
        workspace.id,
        nonExistentPostId,
        "planned",
        adminActor,
        db
      );

      expect(updateRes.success).toBe(false);
      if (!updateRes.success) {
        expect(updateRes.code).toBe("NOT_FOUND");
      }
    });

    it("verifies canModeratePosts helper logic", () => {
      expect(canModeratePosts(ownerActor)).toBe(true);
      expect(canModeratePosts(adminActor)).toBe(true);
      expect(canModeratePosts(memberActor)).toBe(false);
      expect(canModeratePosts(guestActor)).toBe(false);
      expect(canModeratePosts(visitorActor)).toBe(false);
      expect(canModeratePosts(undefined)).toBe(false);
    });
  });
});
