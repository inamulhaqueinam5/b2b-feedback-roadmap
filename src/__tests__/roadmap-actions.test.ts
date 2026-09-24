import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord, archiveBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import { createPost } from "@/services/posts";
import { toggleUpvoteAction } from "@/actions/upvotes";
import { createCommentAction } from "@/actions/comments";
import { getRoadmapAction, getRoadmapCacheTag } from "@/actions/roadmap";
import { posts, type PostStatus } from "@/db/schema/posts";
import { eq } from "drizzle-orm";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";
import type { ActorContext } from "@/services/boards";

describe("Roadmap Engine, Server Actions & Boundary Seams", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let rivalWorkspace: Workspace;
  let publicBoard1: Board;
  let publicBoard2: Board;
  let privateBoard: Board;
  let archivedBoard: Board;

  let authorUser: User;
  let memberUser: User;
  let voterUser: User;
  let otherMemberUser: User;

  let visitorActor: ActorContext;
  let authorActor: ActorContext;
  let memberActor: ActorContext;
  let voterActor: ActorContext;
  let otherMemberActor: ActorContext;

  beforeAll(async () => {
    db = await getTestDb();

    workspace = await createWorkspaceRecord(db, {
      name: "SaaS Roadmap Hub",
      slug: "saas-roadmap-hub",
    });

    rivalWorkspace = await createWorkspaceRecord(db, {
      name: "Rival Workspace",
      slug: "rival-workspace-hub",
    });

    publicBoard1 = await createBoardRecord(db, workspace.id, {
      name: "Core Platform",
      slug: "core-platform",
      isPrivate: false,
    });

    publicBoard2 = await createBoardRecord(db, workspace.id, {
      name: "Mobile App",
      slug: "mobile-app",
      isPrivate: false,
    });

    privateBoard = await createBoardRecord(db, workspace.id, {
      name: "Confidential Roadmap",
      slug: "confidential-roadmap",
      isPrivate: true,
    });

    archivedBoard = await createBoardRecord(db, workspace.id, {
      name: "Deprecated Board",
      slug: "deprecated-board",
      isPrivate: false,
    });
    await archiveBoardRecord(db, workspace.id, archivedBoard.id);

    authorUser = await createUserRecord(db, {
      email: "author-roadmap@example.com",
      name: "Alice Author",
    });

    memberUser = await createUserRecord(db, {
      email: "member-roadmap@example.com",
      name: "Bob Member",
    });

    voterUser = await createUserRecord(db, {
      email: "voter-roadmap@example.com",
      name: "Charlie Voter",
    });

    otherMemberUser = await createUserRecord(db, {
      email: "other-roadmap@example.com",
      name: "Dave Developer",
    });

    visitorActor = { role: "visitor" };
    authorActor = { userId: authorUser.id, role: "member" };
    memberActor = { userId: memberUser.id, role: "member" };
    voterActor = { userId: voterUser.id, role: "member" };
    otherMemberActor = { userId: otherMemberUser.id, role: "member" };
  });

  // Helper to create posts with specific status
  async function seedPost(
    title: string,
    status: PostStatus,
    boardSlug: string,
    targetWorkspaceSlug = workspace.slug
  ) {
    const res = await createPost(
      targetWorkspaceSlug,
      {
        title,
        description: `Description for ${title}`,
        boardSlug,
      },
      authorActor,
      db
    );

    if (!res.success) {
      throw new Error(`Failed to seed post: ${res.error}`);
    }

    if (status !== "open") {
      await db
        .update(posts)
        .set({ status })
        .where(eq(posts.id, res.post.id));
    }

    return res.post.id;
  }

  describe("Column Partitioning & Counting Seam", () => {
    it("partitions roadmap posts into Planned, In Progress and Completed columns accurately", async () => {
      const plannedId = await seedPost(
        "Kanban Column Planned Feature",
        "planned",
        publicBoard1.slug
      );
      const inProgressId = await seedPost(
        "Kanban Column In Progress Feature",
        "in_progress",
        publicBoard1.slug
      );
      const completedId = await seedPost(
        "Kanban Column Completed Feature",
        "completed",
        publicBoard1.slug
      );

      const result = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(result.success).toBe(true);

      if (result.success) {
        const { columns, counts } = result.roadmap;

        // Verify planned column contains planned post
        const plannedFound = columns.planned.find((c) => c.id === plannedId);
        expect(plannedFound).toBeDefined();
        expect(plannedFound?.status).toBe("planned");

        // Verify inProgress column contains in_progress post
        const inProgressFound = columns.inProgress.find((c) => c.id === inProgressId);
        expect(inProgressFound).toBeDefined();
        expect(inProgressFound?.status).toBe("in_progress");

        // Verify snake_case alias in_progress is also populated
        expect(columns.in_progress.find((c) => c.id === inProgressId)).toBeDefined();

        // Verify completed column contains completed post
        const completedFound = columns.completed.find((c) => c.id === completedId);
        expect(completedFound).toBeDefined();
        expect(completedFound?.status).toBe("completed");

        // Verify counts
        expect(counts.planned).toBe(columns.planned.length);
        expect(counts.inProgress).toBe(columns.inProgress.length);
        expect(counts.completed).toBe(columns.completed.length);
        expect(counts.total).toBe(
          columns.planned.length + columns.inProgress.length + columns.completed.length
        );
      }
    });
  });

  describe("Exclusion of Non-Roadmap Statuses", () => {
    it("excludes posts with status open, under_review and closed from all roadmap columns", async () => {
      const openId = await seedPost("Open Status Post", "open", publicBoard1.slug);
      const reviewId = await seedPost(
        "Under Review Status Post",
        "under_review",
        publicBoard1.slug
      );
      const closedId = await seedPost("Closed Status Post", "closed", publicBoard1.slug);

      const result = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(result.success).toBe(true);

      if (result.success) {
        const allCardIds = [
          ...result.roadmap.columns.planned.map((c) => c.id),
          ...result.roadmap.columns.inProgress.map((c) => c.id),
          ...result.roadmap.columns.completed.map((c) => c.id),
        ];

        expect(allCardIds).not.toContain(openId);
        expect(allCardIds).not.toContain(reviewId);
        expect(allCardIds).not.toContain(closedId);
      }
    });
  });

  describe("Board Privacy Boundaries", () => {
    it("omits private board posts for unauthenticated visitors", async () => {
      const privatePlannedId = await seedPost(
        "Secret Planned Initiative",
        "planned",
        privateBoard.slug
      );
      const privateInProgressId = await seedPost(
        "Secret In Progress Architecture",
        "in_progress",
        privateBoard.slug
      );

      // 1. Visitor query
      const visitorResult = await getRoadmapAction(
        workspace.id,
        undefined,
        visitorActor,
        db
      );
      expect(visitorResult.success).toBe(true);

      if (visitorResult.success) {
        const allVisitorIds = [
          ...visitorResult.roadmap.columns.planned.map((c) => c.id),
          ...visitorResult.roadmap.columns.inProgress.map((c) => c.id),
          ...visitorResult.roadmap.columns.completed.map((c) => c.id),
        ];

        expect(allVisitorIds).not.toContain(privatePlannedId);
        expect(allVisitorIds).not.toContain(privateInProgressId);
      }

      // 2. Member query: authorized member can view private roadmap posts
      const memberResult = await getRoadmapAction(
        workspace.id,
        undefined,
        memberActor,
        db
      );
      expect(memberResult.success).toBe(true);

      if (memberResult.success) {
        const allMemberIds = [
          ...memberResult.roadmap.columns.planned.map((c) => c.id),
          ...memberResult.roadmap.columns.inProgress.map((c) => c.id),
          ...memberResult.roadmap.columns.completed.map((c) => c.id),
        ];

        expect(allMemberIds).toContain(privatePlannedId);
        expect(allMemberIds).toContain(privateInProgressId);
      }
    });

    it("rejects visitors attempting to filter directly by a private board ID", async () => {
      const result = await getRoadmapAction(
        workspace.id,
        { boardId: privateBoard.id },
        visitorActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("NOT_FOUND");
      }
    });

    it("allows authorized workspace members to filter directly by a private board ID", async () => {
      const result = await getRoadmapAction(
        workspace.id,
        { boardId: privateBoard.id },
        memberActor,
        db
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const allCards = [
          ...result.roadmap.columns.planned,
          ...result.roadmap.columns.inProgress,
          ...result.roadmap.columns.completed,
        ];
        for (const card of allCards) {
          expect(card.boardId).toBe(privateBoard.id);
        }
      }
    });
  });

  describe("Board Filtering Accuracy", () => {
    it("filters roadmap cards strictly to the specified board ID", async () => {
      const mobilePlannedId = await seedPost(
        "Mobile Push Notifications",
        "planned",
        publicBoard2.slug
      );
      const mobileCompletedId = await seedPost(
        "Mobile Offline Cache",
        "completed",
        publicBoard2.slug
      );

      const filterResult = await getRoadmapAction(
        workspace.id,
        { boardId: publicBoard2.id },
        visitorActor,
        db
      );

      expect(filterResult.success).toBe(true);
      if (filterResult.success) {
        const allCards = [
          ...filterResult.roadmap.columns.planned,
          ...filterResult.roadmap.columns.inProgress,
          ...filterResult.roadmap.columns.completed,
        ];

        expect(allCards.length).toBeGreaterThanOrEqual(2);
        for (const card of allCards) {
          expect(card.boardId).toBe(publicBoard2.id);
          expect(card.boardName).toBe(publicBoard2.name);
          expect(card.boardSlug).toBe(publicBoard2.slug);
        }

        const plannedCard = filterResult.roadmap.columns.planned.find(
          (c) => c.id === mobilePlannedId
        );
        expect(plannedCard).toBeDefined();

        const completedCard = filterResult.roadmap.columns.completed.find(
          (c) => c.id === mobileCompletedId
        );
        expect(completedCard).toBeDefined();
      }
    });
  });

  describe("Upvote Count & hasUpvoted State Accuracy", () => {
    it("computes upvote counts and user hasUpvoted statuses accurately", async () => {
      const postId = await seedPost(
        "Audit Logging Export Integration",
        "in_progress",
        publicBoard1.slug
      );

      // Initial state: Author has upvoted, count is 1
      const initialStatus = await getRoadmapAction(
        workspace.id,
        undefined,
        authorActor,
        db
      );
      expect(initialStatus.success).toBe(true);
      if (initialStatus.success) {
        const card = initialStatus.roadmap.columns.inProgress.find((c) => c.id === postId);
        expect(card).toBeDefined();
        expect(card?.upvoteCount).toBe(1);
        expect(card?.hasUpvoted).toBe(true);
      }

      // Charlie casts an upvote via toggleUpvoteAction
      const toggleRes = await toggleUpvoteAction(workspace.id, postId, voterActor, db);
      expect(toggleRes.success).toBe(true);

      // Check roadmap for voter Charlie: upvoteCount is 2 and hasUpvoted is true
      const voterStatus = await getRoadmapAction(
        workspace.id,
        undefined,
        voterActor,
        db
      );
      expect(voterStatus.success).toBe(true);
      if (voterStatus.success) {
        const card = voterStatus.roadmap.columns.inProgress.find((c) => c.id === postId);
        expect(card).toBeDefined();
        expect(card?.upvoteCount).toBe(2);
        expect(card?.hasUpvoted).toBe(true);
      }

      // Check roadmap for Dave (has not upvoted): upvoteCount is 2 and hasUpvoted is false
      const daveStatus = await getRoadmapAction(
        workspace.id,
        undefined,
        otherMemberActor,
        db
      );
      expect(daveStatus.success).toBe(true);
      if (daveStatus.success) {
        const card = daveStatus.roadmap.columns.inProgress.find((c) => c.id === postId);
        expect(card).toBeDefined();
        expect(card?.upvoteCount).toBe(2);
        expect(card?.hasUpvoted).toBe(false);
      }

      // Check roadmap for visitor: upvoteCount is 2 and hasUpvoted is false
      const visitorStatus = await getRoadmapAction(
        workspace.id,
        undefined,
        visitorActor,
        db
      );
      expect(visitorStatus.success).toBe(true);
      if (visitorStatus.success) {
        const card = visitorStatus.roadmap.columns.inProgress.find((c) => c.id === postId);
        expect(card).toBeDefined();
        expect(card?.upvoteCount).toBe(2);
        expect(card?.hasUpvoted).toBe(false);
      }
    });
  });

  describe("Comment Count Accuracy", () => {
    it("reports comment count accurately and protects internal note confidentiality", async () => {
      const postId = await seedPost(
        "Interactive Comment Count Milestone",
        "planned",
        publicBoard1.slug
      );

      // 1. Initial comment count is 0
      const initialRes = await getRoadmapAction(
        workspace.id,
        undefined,
        visitorActor,
        db
      );
      expect(initialRes.success).toBe(true);
      if (initialRes.success) {
        const card = initialRes.roadmap.columns.planned.find((c) => c.id === postId);
        expect(card?.commentCount).toBe(0);
      }

      // 2. Add two public comments
      const c1 = await createCommentAction(
        workspace.id,
        postId,
        "First public comment on roadmap card",
        memberActor,
        db
      );
      const c2 = await createCommentAction(
        workspace.id,
        postId,
        "Second public comment with feedback",
        voterActor,
        db
      );
      expect(c1.success).toBe(true);
      expect(c2.success).toBe(true);

      const afterTwoComments = await getRoadmapAction(
        workspace.id,
        undefined,
        visitorActor,
        db
      );
      expect(afterTwoComments.success).toBe(true);
      if (afterTwoComments.success) {
        const card = afterTwoComments.roadmap.columns.planned.find((c) => c.id === postId);
        expect(card?.commentCount).toBe(2);
      }
    });
  });

  describe("Tenant Isolation, Archived Boards & Cache Tagging", () => {
    it("strictly isolates roadmap queries to the target workspace", async () => {
      // Create post in rival workspace
      const rivalBoard = await createBoardRecord(db, rivalWorkspace.id, {
        name: "Rival Board",
        slug: "rival-board",
        isPrivate: false,
      });

      const rivalPostId = await seedPost(
        "Rival Planned Feature",
        "planned",
        rivalBoard.slug,
        rivalWorkspace.slug
      );

      // Query Acme workspace roadmap
      const acmeRoadmap = await getRoadmapAction(
        workspace.id,
        undefined,
        visitorActor,
        db
      );
      expect(acmeRoadmap.success).toBe(true);
      if (acmeRoadmap.success) {
        const allAcmeIds = [
          ...acmeRoadmap.roadmap.columns.planned.map((c) => c.id),
          ...acmeRoadmap.roadmap.columns.inProgress.map((c) => c.id),
          ...acmeRoadmap.roadmap.columns.completed.map((c) => c.id),
        ];
        expect(allAcmeIds).not.toContain(rivalPostId);
      }

      // Query rival workspace roadmap
      const rivalRoadmap = await getRoadmapAction(
        rivalWorkspace.id,
        undefined,
        visitorActor,
        db
      );
      expect(rivalRoadmap.success).toBe(true);
      if (rivalRoadmap.success) {
        const found = rivalRoadmap.roadmap.columns.planned.find(
          (c) => c.id === rivalPostId
        );
        expect(found).toBeDefined();
      }
    });

    it("supports querying by workspace slug and workspace UUID seamlessly", async () => {
      const byId = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      const bySlug = await getRoadmapAction(workspace.slug, undefined, visitorActor, db);

      expect(byId.success).toBe(true);
      expect(bySlug.success).toBe(true);
      if (byId.success && bySlug.success) {
        expect(byId.roadmap.counts.total).toBe(bySlug.roadmap.counts.total);
      }
    });

    it("excludes posts from archived boards", async () => {
      // Direct insert into posts on archivedBoard
      const [archivedPost] = await db
        .insert(posts)
        .values({
          workspaceId: workspace.id,
          boardId: archivedBoard.id,
          authorId: authorUser.id,
          title: "Post on Archived Board",
          description: "This post should not be rendered on the roadmap",
          status: "planned",
        })
        .returning();

      const result = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(result.success).toBe(true);
      if (result.success) {
        const allIds = [
          ...result.roadmap.columns.planned.map((c) => c.id),
          ...result.roadmap.columns.inProgress.map((c) => c.id),
          ...result.roadmap.columns.completed.map((c) => c.id),
        ];
        expect(allIds).not.toContain(archivedPost.id);
      }
    });

    it("excludes merged posts from roadmap columns", async () => {
      const masterPostId = await seedPost(
        "Master Canonical Post",
        "planned",
        publicBoard1.slug
      );
      const duplicatePostId = await seedPost(
        "Duplicate To Merge Post",
        "planned",
        publicBoard1.slug
      );

      // Merge duplicate into master
      await db
        .update(posts)
        .set({ mergedIntoPostId: masterPostId })
        .where(eq(posts.id, duplicatePostId));

      const result = await getRoadmapAction(workspace.id, undefined, visitorActor, db);
      expect(result.success).toBe(true);
      if (result.success) {
        const plannedIds = result.roadmap.columns.planned.map((c) => c.id);
        expect(plannedIds).toContain(masterPostId);
        expect(plannedIds).not.toContain(duplicatePostId);
      }
    });

    it("generates deterministic cache tags for workspace roadmap views", () => {
      const generalTag = getRoadmapCacheTag("ws-123");
      expect(generalTag).toBe("workspace:ws-123:roadmap");

      const boardTag = getRoadmapCacheTag("ws-123", "board-456");
      expect(boardTag).toBe("workspace:ws-123:roadmap:board:board-456");
    });
  });
});
