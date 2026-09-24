"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import type { DbClient } from "@/db/repositories/workspaces";
import {
  toggleUpvote,
  getUpvoteStatus,
  type ToggleUpvoteResult,
  type UpvoteStatusResult,
} from "@/services/upvotes";
import { getActorContext } from "@/lib/auth-context";
import type { ActorContext } from "@/services/boards";

export type { ToggleUpvoteResult, UpvoteStatusResult };

/**
 * Server Action to toggle an upvote on a post.
 * Revalidates workspace paths and tags upon successful state mutations.
 */
export async function toggleUpvoteAction(
  workspaceId: string,
  postId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<ToggleUpvoteResult> {
  const activeDb = dbClient ?? db;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId.trim());
  const effectiveActor =
    actor ??
    (await getActorContext({
      workspaceId: isUuid ? workspaceId : undefined,
      workspaceSlug: isUuid ? undefined : workspaceId,
      dbClient: activeDb,
    }));

  const result = await toggleUpvote(workspaceId, postId, effectiveActor, activeDb);

  if (result.success) {
    try {
      revalidatePath(`/w/${result.workspace.slug}`);
      revalidatePath(`/w/${result.workspace.slug}/p/${postId}`);
      revalidatePath(`/w/${result.workspace.slug}/roadmap`);
    } catch {
      // Path revalidation is gracefully skipped in non-request environments
    }

    try {
      revalidateTag(`post:${postId}`);
      revalidateTag(`workspace:${result.workspace.id}:posts`);
      revalidateTag(`workspace:${result.workspace.slug}:posts`);
      revalidateTag(`workspace:${result.workspace.id}:roadmap`);
      revalidateTag(`workspace:${result.workspace.slug}:roadmap`);
    } catch {
      // Tag revalidation is gracefully skipped in non-request environments
    }
  }

  return result;
}

/**
 * Server Action to query the current upvote status and count for a post.
 */
export async function getUpvoteStatusAction(
  workspaceId: string,
  postId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<UpvoteStatusResult> {
  const activeDb = dbClient ?? db;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId.trim());
  const effectiveActor =
    actor ??
    (await getActorContext({
      workspaceId: isUuid ? workspaceId : undefined,
      workspaceSlug: isUuid ? undefined : workspaceId,
      dbClient: activeDb,
    }));

  return getUpvoteStatus(workspaceId, postId, effectiveActor, activeDb);
}
