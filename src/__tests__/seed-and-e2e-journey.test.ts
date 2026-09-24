import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "@/db/test-db";
import { seedDatabase } from "@/db/seed";
import { posts } from "@/db/schema/posts";
import { getRoadmapAction } from "@/actions/roadmap";
import { getPostDetailAction, getPostsForBoardAction } from "@/actions/posts";
import { getPostCommentsAction } from "@/actions/comments";
import { getInternalNotesAction } from "@/actions/internal-notes";
import { getNotificationsAction } from "@/actions/notifications";
import type { ActorContext } from "@/services/boards";

describe("Database Seeding & End-to-End User Journey Verification", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let seedResult: Awaited<ReturnType<typeof seedDatabase>>;

  let ownerActor: ActorContext;
  let adminActor: ActorContext;
  let memberActor: ActorContext;
  let guestActor: ActorContext;
  let visitorActor: ActorContext;

  beforeAll(async () => {
    db = await getTestDb();
    seedResult = await seedDatabase(db);

    const [owner, admin, member, guest] = seedResult.users;

    ownerActor = {
      userId: owner.id,
      role: "owner",
      user: { id: owner.id, name: owner.name, email: owner.email },
    };

    adminActor = {
      userId: admin.id,
      role: "admin",
      user: { id: admin.id, name: admin.name, email: admin.email },
    };

    memberActor = {
      userId: member.id,
      role: "member",
      user: { id: member.id, name: member.name, email: member.email },
    };

    guestActor = {
      userId: guest.id,
      role: "guest",
      user: { id: guest.id, name: guest.name, email: guest.email },
    };

    visitorActor = {
      role: "visitor",
    };
  });

  describe("Seed Data Integrity", () => {
    it("successfully creates the demo workspace with configured branding", () => {
      expect(seedResult.workspace.name).toBe("Acme Cloud Platform");
      expect(seedResult.workspace.slug).toBe("acme-cloud");
      expect(seedResult.workspace.brandColor).toBe("#0ea5e9");
    });

    it("seeds 4 distinct boards with proper privacy controls", () => {
      expect(seedResult.boards.length).toBeGreaterThanOrEqual(4);
      const publicBoards = seedResult.boards.filter((b) => !b.isPrivate);
      const privateBoards = seedResult.boards.filter((b) => b.isPrivate);

      expect(publicBoards.length).toBe(3);
      expect(privateBoards.length).toBe(1);
      expect(privateBoards[0].slug).toBe("infra");
    });

    it("seeds demo users across owner, admin, member and guest roles", () => {
      expect(seedResult.users.length).toBe(5);
      const emails = seedResult.users.map((u) => u.email);
      expect(emails).toContain("alex@acme.com");
      expect(emails).toContain("sarah@acme.com");
      expect(emails).toContain("elena@customer.com");
    });

    it("seeds posts across all lifecycle statuses", () => {
      const statuses = seedResult.posts.map((p) => p.status);
      expect(statuses).toContain("planned");
      expect(statuses).toContain("in_progress");
      expect(statuses).toContain("completed");
      expect(statuses).toContain("open");
      expect(statuses).toContain("under_review");
    });
  });

  describe("Public Visitor Journey", () => {
    it("allows visitor to browse public board posts without authentication", async () => {
      const res = await getPostsForBoardAction(
        seedResult.workspace.slug,
        "features",
        undefined,
        visitorActor,
        db
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.posts.length).toBeGreaterThan(0);
        for (const post of res.posts) {
          expect(post.associatedMrr).toBeNull(); // Never leaked to visitors
        }
      }
    });

    it("allows visitor to explore the 3-column roadmap", async () => {
      const res = await getRoadmapAction(seedResult.workspace.slug, undefined, visitorActor, db);

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.roadmap.columns.planned.length).toBeGreaterThan(0);
        expect(res.roadmap.columns.inProgress.length).toBeGreaterThan(0);
        expect(res.roadmap.columns.completed.length).toBeGreaterThan(0);

        // Open and closed posts must not be in roadmap columns
        const allRoadmapPostIds = [
          ...res.roadmap.columns.planned.map((p) => p.id),
          ...res.roadmap.columns.inProgress.map((p) => p.id),
          ...res.roadmap.columns.completed.map((p) => p.id),
        ];

        const openPosts = seedResult.posts.filter((p) => p.status === "open");
        for (const openPost of openPosts) {
          expect(allRoadmapPostIds).not.toContain(openPost.id);
        }
      }
    });

    it("blocks visitor from viewing private internal architecture board posts", async () => {
      const res = await getPostsForBoardAction(
        seedResult.workspace.slug,
        "infra",
        undefined,
        visitorActor,
        db
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Board not found");
      }
    });
  });

  describe("Admin & Discussion Journey", () => {
    it("exposes private internal notes and Associated MRR to admins", async () => {
      const apiPost = seedResult.posts.find((p) => p.title.includes("Granular API permission"));
      expect(apiPost).toBeDefined();

      if (apiPost) {
        // Admin detail view exposes MRR
        const detailRes = await getPostDetailAction(seedResult.workspace.slug, apiPost.id, adminActor, db);
        expect(detailRes.success).toBe(true);
        if (detailRes.success) {
          expect(detailRes.post.associatedMrr).toBe("14500.00");
        }

        // Admin can access internal notes tab
        const notesRes = await getInternalNotesAction(seedResult.workspace.id, apiPost.id, adminActor, db);
        expect(notesRes.success).toBe(true);
        if (notesRes.success) {
          expect(notesRes.notes.length).toBeGreaterThan(0);
          expect(notesRes.notes[0].isInternalNote).toBe(true);
          expect(notesRes.notes[0].content).toContain("Enterprise client");
        }

        // Public comments stream contains discussion and system audit items
        const commentsRes = await getPostCommentsAction(seedResult.workspace.id, apiPost.id, adminActor, db);
        expect(commentsRes.success).toBe(true);
        if (commentsRes.success) {
          const systemAudits = commentsRes.comments.filter((c) => c.isSystemAudit);
          const userComments = commentsRes.comments.filter((c) => !c.isSystemAudit && !c.isInternalNote);

          expect(systemAudits.length).toBeGreaterThan(0);
          expect(userComments.length).toBeGreaterThan(0);
          // Zero internal notes leaked in comments stream
          for (const c of commentsRes.comments) {
            expect(c.isInternalNote).toBe(false);
          }
        }
      }
    });

    it("strictly isolates internal notes from regular community members", async () => {
      const apiPost = seedResult.posts.find((p) => p.title.includes("Granular API permission"));
      expect(apiPost).toBeDefined();

      if (apiPost) {
        // Guest/visitor detail view hides MRR
        const detailRes = await getPostDetailAction(seedResult.workspace.slug, apiPost.id, guestActor, db);
        expect(detailRes.success).toBe(true);
        if (detailRes.success) {
          expect(detailRes.post.associatedMrr).toBeNull();
        }

        // Guest is blocked from reading internal notes
        const notesRes = await getInternalNotesAction(seedResult.workspace.id, apiPost.id, guestActor, db);
        expect(notesRes.success).toBe(false);
        if (!notesRes.success) {
          expect(notesRes.code).toBe("FORBIDDEN");
        }
      }
    });
  });

  describe("Duplicate Post Merge Verification", () => {
    it("redirects merged duplicate requests to canonical master post", async () => {
      const csvMasterPost = seedResult.posts.find((p) => p.title.includes("Custom export to CSV"));
      expect(csvMasterPost).toBeDefined();

      const [dupPost] = await db
        .select()
        .from(posts)
        .where(eq(posts.title, "CSV download of billing events and usage logs"))
        .limit(1);

      expect(dupPost).toBeDefined();
      expect(dupPost.status).toBe("closed");
      expect(dupPost.mergedIntoPostId).toBe(csvMasterPost?.id);

      const dupDetail = await getPostDetailAction(seedResult.workspace.slug, dupPost.id, visitorActor, db);
      expect(dupDetail.success).toBe(true);
      if (dupDetail.success) {
        expect(dupDetail.mergedIntoPost).toBeDefined();
        expect(dupDetail.mergedIntoPost?.id).toBe(csvMasterPost?.id);
        expect(dupDetail.mergedIntoPost?.title).toBe(csvMasterPost?.title);
      }
    });
  });

  describe("In-App Notification Feed", () => {
    it("retrieves seeded notifications for active users", async () => {
      const elena = seedResult.users.find((u) => u.email === "elena@customer.com");
      expect(elena).toBeDefined();

      if (elena) {
        const notifActor: ActorContext = {
          userId: elena.id,
          role: "guest",
          user: { id: elena.id, name: elena.name, email: elena.email },
        };

        const res = await getNotificationsAction(seedResult.workspace.slug, notifActor, db);
        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.notifications.length).toBeGreaterThan(0);
          expect(res.unreadCount).toBeGreaterThan(0);
        }
      }
    });
  });
});
