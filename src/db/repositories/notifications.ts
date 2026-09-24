import { eq, and, desc, sql } from "drizzle-orm";
import { notifications, type Notification, type NewNotification } from "@/db/schema/notifications";
import { posts, postSubscribers } from "@/db/schema/posts";
import type { DbClient } from "@/db/repositories/workspaces";

export interface UserNotificationItem extends Notification {
  postTitle?: string | null;
  postStatus?: string | null;
}

/**
 * Creates a single notification record.
 */
export async function createNotificationRecord(
  db: DbClient,
  input: NewNotification
): Promise<Notification> {
  const [created] = await db.insert(notifications).values(input).returning();
  return created;
}

/**
 * Inserts multiple notification records in a single batch query.
 */
export async function createNotificationRecordsBatch(
  db: DbClient,
  inputs: NewNotification[]
): Promise<Notification[]> {
  if (inputs.length === 0) return [];
  return db.insert(notifications).values(inputs).returning();
}

/**
 * Retrieves chronological notifications for a specific user in a workspace.
 */
export async function findNotificationsByUser(
  db: DbClient,
  workspaceId: string,
  userId: string,
  options?: { limit?: number; offset?: number }
): Promise<UserNotificationItem[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const rows = await db
    .select({
      id: notifications.id,
      workspaceId: notifications.workspaceId,
      userId: notifications.userId,
      postId: notifications.postId,
      type: notifications.type,
      message: notifications.message,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
      postTitle: posts.title,
      postStatus: posts.status,
    })
    .from(notifications)
    .leftJoin(posts, eq(notifications.postId, posts.id))
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    postId: row.postId,
    type: row.type,
    message: row.message,
    isRead: row.isRead,
    createdAt: row.createdAt,
    postTitle: row.postTitle ?? null,
    postStatus: row.postStatus ?? null,
  }));
}

/**
 * Counts unread notifications for a specific user within a workspace.
 */
export async function countUnreadNotifications(
  db: DbClient,
  workspaceId: string,
  userId: string
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      )
    );

  return Number(result?.count ?? 0);
}

/**
 * Marks a specific notification as read, enforcing workspace and user boundaries.
 */
export async function markNotificationAsReadRecord(
  db: DbClient,
  workspaceId: string,
  userId: string,
  notificationId: string
): Promise<Notification | null> {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId)
      )
    )
    .returning();

  return updated ?? null;
}

/**
 * Marks all unread notifications as read for a user within a workspace.
 */
export async function markAllNotificationsAsReadRecord(
  db: DbClient,
  workspaceId: string,
  userId: string
): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      )
    )
    .returning();

  return updated.length;
}

/**
 * Gets all user IDs subscribed to a given post.
 */
export async function getPostSubscribers(
  db: DbClient,
  postId: string
): Promise<string[]> {
  const rows = await db
    .select({ userId: postSubscribers.userId })
    .from(postSubscribers)
    .where(eq(postSubscribers.postId, postId));

  return rows.map((r) => r.userId);
}

/**
 * Subscribes a user to a post.
 */
export async function addPostSubscriber(
  db: DbClient,
  postId: string,
  userId: string
): Promise<void> {
  await db
    .insert(postSubscribers)
    .values({ postId, userId })
    .onConflictDoNothing();
}

/**
 * Unsubscribes a user from a post.
 */
export async function removePostSubscriber(
  db: DbClient,
  postId: string,
  userId: string
): Promise<void> {
  await db
    .delete(postSubscribers)
    .where(
      and(
        eq(postSubscribers.postId, postId),
        eq(postSubscribers.userId, userId)
      )
    );
}
