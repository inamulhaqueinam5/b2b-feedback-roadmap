import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord, createWorkspaceMemberRecord } from "@/db/repositories/auth";
import { createPost } from "@/services/posts";
import { updatePostStatusAction } from "@/actions/posts";
import {
  getNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
} from "@/actions/notifications";
import {
  dispatchStatusChangeNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/services/notifications";
import {
  addPostSubscriber,
  findNotificationsByUser,
  countUnreadNotifications,
} from "@/db/repositories/notifications";
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

describe("In-App Activity Notifications & Server Actions Seams", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace1: Workspace;
  let workspace2: Workspace;
  let board1: Board;
  let board2: Board;

  let ownerUser: User;
  let memberUserA: User;
  let memberUserB: User;
  let otherTenantUser: User;

  let ownerActor: ActorContext;
  let memberActorA: ActorContext;
  let memberActorB: ActorContext;
  let visitorActor: ActorContext;
  let otherTenantActor: ActorContext;

  beforeAll(async () => {
    db = await getTestDb();

    workspace1 = await createWorkspaceRecord(db, {
      name: "Acme Cloud",
      slug: "acme-cloud",
    });

    workspace2 = await createWorkspaceRecord(db, {
      name: "Starlight SaaS",
      slug: "starlight-saas",
    });

    board1 = await createBoardRecord(db, workspace1.id, {
      name: "Feature Requests",
      slug: "feature-requests",
      isPrivate: false,
    });

    board2 = await createBoardRecord(db, workspace2.id, {
      name: "Product Ideas",
      slug: "product-ideas",
      isPrivate: false,
    });

    ownerUser = await createUserRecord(db, {
      email: "owner@acme-cloud.com",
      name: "Alice Owner",
    });
    await createWorkspaceMemberRecord(db, {
      workspaceId: workspace1.id,
      userId: ownerUser.id,
      role: "owner",
    });

    memberUserA = await createUserRecord(db, {
      email: "member-a@acme-cloud.com",
      name: "Bob Subscriber",
    });
    await createWorkspaceMemberRecord(db, {
      workspaceId: workspace1.id,
      userId: memberUserA.id,
      role: "member",
    });

    memberUserB = await createUserRecord(db, {
      email: "member-b@acme-cloud.com",
      name: "Charlie Follower",
    });
    await createWorkspaceMemberRecord(db, {
      workspaceId: workspace1.id,
      userId: memberUserB.id,
      role: "member",
    });

    otherTenantUser = await createUserRecord(db, {
      email: "user@starlight.com",
      name: "Diana Starlight",
    });
    await createWorkspaceMemberRecord(db, {
      workspaceId: workspace2.id,
      userId: otherTenantUser.id,
      role: "member",
    });

    ownerActor = {
      userId: ownerUser.id,
      role: "owner",
      user: {
        id: ownerUser.id,
        name: ownerUser.name,
        email: ownerUser.email,
        image: ownerUser.image,
      },
    };

    memberActorA = {
      userId: memberUserA.id,
      role: "member",
      user: {
        id: memberUserA.id,
        name: memberUserA.name,
        email: memberUserA.email,
        image: memberUserA.image,
      },
    };

    memberActorB = {
      userId: memberUserB.id,
      role: "member",
      user: {
        id: memberUserB.id,
        name: memberUserB.name,
        email: memberUserB.email,
        image: memberUserB.image,
      },
    };

    visitorActor = {
      role: "visitor",
    };

    otherTenantActor = {
      userId: otherTenantUser.id,
      role: "member",
      user: {
        id: otherTenantUser.id,
        name: otherTenantUser.name,
        email: otherTenantUser.email,
        image: otherTenantUser.image,
      },
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Status Change Dispatch to Post Subscribers", () => {
    it("dispatches notifications to all post subscribers when post status transitions", async () => {
      // 1. Create a post by User A (User A automatically subscribed)
      const postResult = await createPost(
        workspace1.slug,
        {
          title: "Dark Mode Theme Support",
          description: "Please provide a dark theme for developers working late at night.",
          boardId: board1.id,
        },
        memberActorA,
        db
      );

      expect(postResult.success).toBe(true);
      if (!postResult.success) return;
      const postId = postResult.post.id;

      // 2. User B subscribes to the post as well
      await addPostSubscriber(db, postId, memberUserB.id);

      // 3. Admin transitions status from open to in_progress
      const updateResult = await updatePostStatusAction(
        workspace1.id,
        postId,
        "in_progress",
        ownerActor,
        db
      );

      expect(updateResult.success).toBe(true);

      // 4. User A should receive a status_change notification
      const userANotifs = await getUserNotifications(workspace1.id, memberUserA.id, db);
      expect(userANotifs.unreadCount).toBeGreaterThanOrEqual(1);

      const notifA = userANotifs.find((n) => n.postId === postId);
      expect(notifA).toBeDefined();
      expect(notifA?.type).toBe("status_change");
      expect(notifA?.message).toContain("In Progress");
      expect(notifA?.message).toContain("Dark Mode Theme Support");
      expect(notifA?.isRead).toBe(false);

      // 5. User B should also receive a status_change notification
      const userBNotifs = await getUserNotifications(workspace1.id, memberUserB.id, db);
      const notifB = userBNotifs.find((n) => n.postId === postId);
      expect(notifB).toBeDefined();
      expect(notifB?.type).toBe("status_change");
      expect(notifB?.message).toContain("In Progress");
      expect(notifB?.isRead).toBe(false);
    });

    it("ensures actor triggering status change does not receive a self-notification", async () => {
      // 1. Owner creates a post (Owner is author and subscribed)
      const postResult = await createPost(
        workspace1.slug,
        {
          title: "Public API Webhooks",
          description: "Support incoming and outgoing webhooks.",
          boardId: board1.id,
        },
        ownerActor,
        db
      );

      expect(postResult.success).toBe(true);
      if (!postResult.success) return;
      const postId = postResult.post.id;

      // Also User B subscribes
      await addPostSubscriber(db, postId, memberUserB.id);

      // Check owner notifications before transition
      const ownerBefore = await getUserNotifications(workspace1.id, ownerUser.id, db);
      const ownerBeforeCount = ownerBefore.filter((n) => n.postId === postId).length;

      // 2. Owner transitions status to planned
      const updateResult = await updatePostStatusAction(
        workspace1.id,
        postId,
        "planned",
        ownerActor,
        db
      );
      expect(updateResult.success).toBe(true);

      // 3. Owner should NOT receive a notification for their own action
      const ownerAfter = await getUserNotifications(workspace1.id, ownerUser.id, db);
      const ownerAfterCount = ownerAfter.filter((n) => n.postId === postId).length;
      expect(ownerAfterCount).toBe(ownerBeforeCount);

      // 4. User B should have received the notification
      const userBNotifs = await getUserNotifications(workspace1.id, memberUserB.id, db);
      const bNotif = userBNotifs.find(
        (n) => n.postId === postId && n.message.includes("Planned")
      );
      expect(bNotif).toBeDefined();
    });

    it("directly dispatches status change notifications via service function", async () => {
      const postResult = await createPost(
        workspace1.slug,
        {
          title: "SSO Integration Support",
          description: "SAML and Okta SSO support for enterprise accounts.",
          boardId: board1.id,
        },
        memberActorA,
        db
      );

      expect(postResult.success).toBe(true);
      if (!postResult.success) return;
      const postId = postResult.post.id;

      const createdNotifs = await dispatchStatusChangeNotification(
        workspace1.id,
        postId,
        "open",
        "completed",
        ownerUser.id,
        db
      );

      expect(createdNotifs.length).toBeGreaterThanOrEqual(1);
      expect(createdNotifs[0].userId).toBe(memberUserA.id);
      expect(createdNotifs[0].message).toContain("Completed");
    });
  });

  describe("Unread Counts, Read State Management and Actions", () => {
    it("fetches chronological notifications with unread counts via getNotificationsAction", async () => {
      const notifsResult = await getNotificationsAction(
        workspace1.id,
        memberActorA,
        db
      );

      expect(notifsResult.success).toBe(true);
      if (!notifsResult.success) return;

      expect(Array.isArray(notifsResult.notifications)).toBe(true);
      expect(typeof notifsResult.unreadCount).toBe("number");
      expect(notifsResult.unreadCount).toBeGreaterThan(0);

      // Verify chronological ordering (latest created first)
      if (notifsResult.notifications.length > 1) {
        for (let i = 0; i < notifsResult.notifications.length - 1; i++) {
          const curr = new Date(notifsResult.notifications[i].createdAt).getTime();
          const next = new Date(notifsResult.notifications[i + 1].createdAt).getTime();
          expect(curr).toBeGreaterThanOrEqual(next);
        }
      }
    });

    it("marks an individual notification as read via markNotificationAsReadAction", async () => {
      const initial = await getNotificationsAction(
        workspace1.id,
        memberActorA,
        db
      );
      expect(initial.success).toBe(true);
      if (!initial.success) return;

      const unreadItem = initial.notifications.find((n) => !n.isRead);
      expect(unreadItem).toBeDefined();
      if (!unreadItem) return;

      const markResult = await markNotificationAsReadAction(
        workspace1.id,
        unreadItem.id,
        memberActorA,
        db
      );

      expect(markResult.success).toBe(true);
      if (!markResult.success) return;
      expect(markResult.notification.id).toBe(unreadItem.id);
      expect(markResult.notification.isRead).toBe(true);

      // Verify updated count
      const after = await getNotificationsAction(
        workspace1.id,
        memberActorA,
        db
      );
      expect(after.success).toBe(true);
      if (!after.success) return;
      expect(after.unreadCount).toBe(initial.unreadCount - 1);
    });

    it("marks all notifications as read via markAllNotificationsAsReadAction", async () => {
      // 1. Ensure User B has unread notifications
      const userBBefore = await getNotificationsAction(
        workspace1.id,
        memberActorB,
        db
      );
      expect(userBBefore.success).toBe(true);
      if (!userBBefore.success) return;

      if (userBBefore.unreadCount === 0) {
        // Create a new post and transition status to create notification
        const postResult = await createPost(
          workspace1.slug,
          {
            title: "CSV Export Capability",
            description: "Export feedback data to CSV files.",
            boardId: board1.id,
          },
          memberActorB,
          db
        );
        if (postResult.success) {
          await updatePostStatusAction(
            workspace1.id,
            postResult.post.id,
            "planned",
            ownerActor,
            db
          );
        }
      }

      // 2. Mark all as read
      const markAllResult = await markAllNotificationsAsReadAction(
        workspace1.id,
        memberActorB,
        db
      );

      expect(markAllResult.success).toBe(true);
      if (!markAllResult.success) return;
      expect(markAllResult.count).toBeGreaterThan(0);

      // 3. Verify unread count is now 0
      const userBAfter = await getNotificationsAction(
        workspace1.id,
        memberActorB,
        db
      );
      expect(userBAfter.success).toBe(true);
      if (!userBAfter.success) return;
      expect(userBAfter.unreadCount).toBe(0);
      expect(userBAfter.notifications.every((n) => n.isRead)).toBe(true);
    });
  });

  describe("Cross-Tenant Isolation and User Session Privacy", () => {
    it("strictly isolates notifications by workspace tenant boundaries", async () => {
      // User A has notifications in workspace 1
      const ws1Notifs = await getNotificationsAction(
        workspace1.id,
        memberActorA,
        db
      );
      expect(ws1Notifs.success).toBe(true);
      if (!ws1Notifs.success) return;
      expect(ws1Notifs.notifications.length).toBeGreaterThan(0);

      // User A querying workspace 2 should receive empty list
      const ws2Notifs = await getNotificationsAction(
        workspace2.id,
        memberActorA,
        db
      );
      expect(ws2Notifs.success).toBe(true);
      if (!ws2Notifs.success) return;
      expect(ws2Notifs.notifications).toHaveLength(0);
      expect(ws2Notifs.unreadCount).toBe(0);

      // Trying to mark workspace 1 notification in workspace 2 context must fail
      const targetNotifId = ws1Notifs.notifications[0].id;
      const crossTenantMark = await markNotificationAsReadAction(
        workspace2.id,
        targetNotifId,
        memberActorA,
        db
      );

      expect(crossTenantMark.success).toBe(false);
      if (!crossTenantMark.success) {
        expect(crossTenantMark.code).toBe("NOT_FOUND");
      }

      // Mark all in workspace 2 must not affect workspace 1
      const crossTenantMarkAll = await markAllNotificationsAsReadAction(
        workspace2.id,
        memberActorA,
        db
      );
      expect(crossTenantMarkAll.success).toBe(true);
      if (crossTenantMarkAll.success) {
        expect(crossTenantMarkAll.count).toBe(0);
      }
    });

    it("enforces user session privacy so users cannot access or mutate each others notifications", async () => {
      const userANotifs = await getNotificationsAction(
        workspace1.id,
        memberActorA,
        db
      );
      expect(userANotifs.success).toBe(true);
      if (!userANotifs.success) return;
      expect(userANotifs.notifications.length).toBeGreaterThan(0);

      const userANotifId = userANotifs.notifications[0].id;

      // User B tries to mark User A's notification as read
      const unauthorizedMark = await markNotificationAsReadAction(
        workspace1.id,
        userANotifId,
        memberActorB,
        db
      );

      expect(unauthorizedMark.success).toBe(false);
      if (!unauthorizedMark.success) {
        expect(unauthorizedMark.code).toBe("NOT_FOUND");
      }

      // User B's notification list does not include User A's notifications
      const userBNotifs = await getNotificationsAction(
        workspace1.id,
        memberActorB,
        db
      );
      expect(userBNotifs.success).toBe(true);
      if (!userBNotifs.success) return;
      expect(userBNotifs.notifications.every((n) => n.userId === memberUserB.id)).toBe(true);
    });

    it("rejects unauthenticated visitor requests with UNAUTHENTICATED error code", async () => {
      const getResult = await getNotificationsAction(
        workspace1.id,
        visitorActor,
        db
      );
      expect(getResult.success).toBe(false);
      if (!getResult.success) {
        expect(getResult.code).toBe("UNAUTHENTICATED");
      }

      const markResult = await markNotificationAsReadAction(
        workspace1.id,
        "any-notification-id",
        visitorActor,
        db
      );
      expect(markResult.success).toBe(false);
      if (!markResult.success) {
        expect(markResult.code).toBe("UNAUTHENTICATED");
      }

      const markAllResult = await markAllNotificationsAsReadAction(
        workspace1.id,
        visitorActor,
        db
      );
      expect(markAllResult.success).toBe(false);
      if (!markAllResult.success) {
        expect(markAllResult.code).toBe("UNAUTHENTICATED");
      }
    });
  });
});
