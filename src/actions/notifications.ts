"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { DbClient } from "@/db/repositories/workspaces";
import { getActorContext } from "@/lib/auth-context";
import type { ActorContext } from "@/services/boards";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type UserNotificationItem,
} from "@/services/notifications";
import type { Notification } from "@/db/schema/notifications";

export type GetNotificationsResult =
  | {
      success: true;
      notifications: UserNotificationItem[];
      unreadCount: number;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export type MarkNotificationResult =
  | {
      success: true;
      notification: Notification;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export type MarkAllNotificationsResult =
  | {
      success: true;
      count: number;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Server action to fetch chronological notifications and unread count for current user.
 */
export async function getNotificationsAction(
  workspaceId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<GetNotificationsResult> {
  const activeDb = dbClient ?? db;
  const isUuid = UUID_REGEX.test(workspaceId.trim());
  const effectiveActor =
    actor ??
    (await getActorContext({
      workspaceId: isUuid ? workspaceId : undefined,
      workspaceSlug: isUuid ? undefined : workspaceId,
      dbClient: activeDb,
    }));

  if (!effectiveActor?.userId || effectiveActor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to view notifications",
      code: "UNAUTHENTICATED",
    };
  }

  const result = await getUserNotifications(
    workspaceId,
    effectiveActor.userId,
    activeDb
  );

  return {
    success: true,
    notifications: result.notifications,
    unreadCount: result.unreadCount,
  };
}

/**
 * Server action to mark an individual notification as read.
 */
export async function markNotificationAsReadAction(
  workspaceId: string,
  notificationId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<MarkNotificationResult> {
  const activeDb = dbClient ?? db;
  const isUuid = UUID_REGEX.test(workspaceId.trim());
  const effectiveActor =
    actor ??
    (await getActorContext({
      workspaceId: isUuid ? workspaceId : undefined,
      workspaceSlug: isUuid ? undefined : workspaceId,
      dbClient: activeDb,
    }));

  if (!effectiveActor?.userId || effectiveActor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to update notifications",
      code: "UNAUTHENTICATED",
    };
  }

  const result = await markNotificationAsRead(
    workspaceId,
    effectiveActor.userId,
    notificationId,
    activeDb
  );

  if (!result.success || !result.notification) {
    return {
      success: false,
      error: result.error ?? "Notification not found",
      code: "NOT_FOUND",
    };
  }

  try {
    revalidatePath(`/w/${workspaceId}`);
  } catch {
    // Revalidation safely skipped in non-request environments
  }

  return {
    success: true,
    notification: result.notification,
  };
}

/**
 * Server action to mark all unread notifications as read for current user in workspace.
 */
export async function markAllNotificationsAsReadAction(
  workspaceId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<MarkAllNotificationsResult> {
  const activeDb = dbClient ?? db;
  const isUuid = UUID_REGEX.test(workspaceId.trim());
  const effectiveActor =
    actor ??
    (await getActorContext({
      workspaceId: isUuid ? workspaceId : undefined,
      workspaceSlug: isUuid ? undefined : workspaceId,
      dbClient: activeDb,
    }));

  if (!effectiveActor?.userId || effectiveActor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to update notifications",
      code: "UNAUTHENTICATED",
    };
  }

  const result = await markAllNotificationsAsRead(
    workspaceId,
    effectiveActor.userId,
    activeDb
  );

  try {
    revalidatePath(`/w/${workspaceId}`);
  } catch {
    // Revalidation safely skipped in non-request environments
  }

  return {
    success: true,
    count: result.count,
  };
}
