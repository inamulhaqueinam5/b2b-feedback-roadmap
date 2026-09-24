import { db as defaultDb } from "@/db";
import {
  createNotificationRecordsBatch,
  findNotificationsByUser,
  countUnreadNotifications,
  markNotificationAsReadRecord,
  markAllNotificationsAsReadRecord,
  getPostSubscribers,
  type UserNotificationItem,
} from "@/db/repositories/notifications";
import { findPostById, formatStatusLabel } from "@/db/repositories/posts";
import {
  getWorkspaceRecordById,
  getWorkspaceRecordBySlug,
  type DbClient,
} from "@/db/repositories/workspaces";
import type { Notification, NewNotification } from "@/db/schema/notifications";
import type { Workspace } from "@/db/schema/workspaces";
import type { PostStatus } from "@/db/schema/posts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveWorkspace(
  workspaceIdOrSlug: string,
  db: DbClient
): Promise<Workspace | null> {
  if (!workspaceIdOrSlug) return null;
  const trimmed = workspaceIdOrSlug.trim();
  if (UUID_REGEX.test(trimmed)) {
    const ws = await getWorkspaceRecordById(db, trimmed);
    if (ws) return ws;
  }
  return getWorkspaceRecordBySlug(db, trimmed.toLowerCase());
}

export type { UserNotificationItem };

export type UserNotificationList = UserNotificationItem[] & {
  success: true;
  notifications: UserNotificationItem[];
  unreadCount: number;
};

export type MarkNotificationServiceResult = {
  success: boolean;
  notification: Notification | null;
  error?: string;
} & Partial<Notification>;

export type MarkAllNotificationsServiceResult = {
  success: boolean;
  count: number;
};

/**
 * Dispatches notifications to all post subscribers when a post status transitions.
 * Excludes the actor who performed the transition to prevent redundant self-notifications.
 */
export async function dispatchStatusChangeNotification(
  workspaceIdOrSlug: string,
  postId: string,
  oldStatus: PostStatus | string,
  newStatus: PostStatus | string,
  actorId?: string,
  dbClient?: DbClient
): Promise<Notification[]> {
  const db = dbClient ?? defaultDb;
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) return [];

  const post = await findPostById(db, workspace.id, postId);
  if (!post) return [];

  const subscriberIds = await getPostSubscribers(db, postId);
  const subscriberSet = new Set(subscriberIds);
  if (post.authorId) {
    subscriberSet.add(post.authorId);
  }

  const recipientIds = Array.from(subscriberSet).filter((id) => id !== actorId);
  if (recipientIds.length === 0) return [];

  const formattedStatus = formatStatusLabel(newStatus as PostStatus) || String(newStatus);
  const message = `Status changed to ${formattedStatus} for "${post.title}"`;

  const newRecords: NewNotification[] = recipientIds.map((userId) => ({
    workspaceId: workspace.id,
    userId,
    postId: post.id,
    type: "status_change",
    message,
    isRead: false,
  }));

  return createNotificationRecordsBatch(db, newRecords);
}

/**
 * Dispatches notifications when an admin or team member leaves a comment.
 * Excludes the author of the comment from receiving a self-notification.
 */
export async function dispatchAdminCommentNotification(
  workspaceIdOrSlug: string,
  postId: string,
  commentSnippet: string,
  actorId?: string,
  dbClient?: DbClient
): Promise<Notification[]> {
  const db = dbClient ?? defaultDb;
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) return [];

  const post = await findPostById(db, workspace.id, postId);
  if (!post) return [];

  const subscriberIds = await getPostSubscribers(db, postId);
  const subscriberSet = new Set(subscriberIds);
  if (post.authorId) {
    subscriberSet.add(post.authorId);
  }

  const recipientIds = Array.from(subscriberSet).filter((id) => id !== actorId);
  if (recipientIds.length === 0) return [];

  const truncatedSnippet =
    commentSnippet.length > 80
      ? `${commentSnippet.slice(0, 77)}...`
      : commentSnippet;
  const message = `Team responded on "${post.title}": ${truncatedSnippet}`;

  const newRecords: NewNotification[] = recipientIds.map((userId) => ({
    workspaceId: workspace.id,
    userId,
    postId: post.id,
    type: "admin_comment",
    message,
    isRead: false,
  }));

  return createNotificationRecordsBatch(db, newRecords);
}

/**
 * Dispatches notifications when a post is merged into another post.
 */
export async function dispatchMergedNotification(
  workspaceIdOrSlug: string,
  sourcePostId: string,
  targetPostId: string,
  targetPostTitle: string,
  actorId?: string,
  dbClient?: DbClient
): Promise<Notification[]> {
  const db = dbClient ?? defaultDb;
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) return [];

  const subscriberIds = await getPostSubscribers(db, sourcePostId);
  const recipientIds = subscriberIds.filter((id) => id !== actorId);
  if (recipientIds.length === 0) return [];

  const message = `Your post was merged into "${targetPostTitle}"`;

  const newRecords: NewNotification[] = recipientIds.map((userId) => ({
    workspaceId: workspace.id,
    userId,
    postId: targetPostId,
    type: "merged",
    message,
    isRead: false,
  }));

  return createNotificationRecordsBatch(db, newRecords);
}

/**
 * Retrieves chronological notifications with read and unread indicators for a user.
 */
export async function getUserNotifications(
  workspaceIdOrSlug: string,
  userId: string,
  dbClient?: DbClient
): Promise<UserNotificationList> {
  const db = dbClient ?? defaultDb;
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);

  if (!workspace) {
    const emptyList: UserNotificationItem[] = [];
    return Object.assign(emptyList, {
      success: true as const,
      notifications: emptyList,
      unreadCount: 0,
    });
  }

  const [items, unreadCount] = await Promise.all([
    findNotificationsByUser(db, workspace.id, userId),
    countUnreadNotifications(db, workspace.id, userId),
  ]);

  return Object.assign(items, {
    success: true as const,
    notifications: items,
    unreadCount,
  });
}

/**
 * Marks an individual notification as read within a workspace.
 */
export async function markNotificationAsRead(
  workspaceIdOrSlug: string,
  userId: string,
  notificationId: string,
  dbClient?: DbClient
): Promise<MarkNotificationServiceResult> {
  const db = dbClient ?? defaultDb;
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);

  if (!workspace) {
    return {
      success: false,
      notification: null,
      error: "Workspace not found",
    };
  }

  const updated = await markNotificationAsReadRecord(
    db,
    workspace.id,
    userId,
    notificationId
  );

  if (!updated) {
    return {
      success: false,
      notification: null,
      error: "Notification not found or access denied",
    };
  }

  return Object.assign(
    {
      success: true,
      notification: updated,
    },
    updated
  );
}

/**
 * Marks all notifications as read for a user within a workspace.
 */
export async function markAllNotificationsAsRead(
  workspaceIdOrSlug: string,
  userId: string,
  dbClient?: DbClient
): Promise<MarkAllNotificationsServiceResult> {
  const db = dbClient ?? defaultDb;
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);

  if (!workspace) {
    return { success: false, count: 0 };
  }

  const count = await markAllNotificationsAsReadRecord(
    db,
    workspace.id,
    userId
  );

  return { success: true, count };
}
