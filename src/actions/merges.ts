"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import type { DbClient } from "@/db/repositories/workspaces";
import { mergePosts, type MergePostsResult } from "@/services/merges";
import { getRoadmapCacheTag } from "@/lib/cache-tags";
import { getActorContext } from "@/lib/auth-context";
import type { ActorContext } from "@/services/boards";

export type { MergePostsResult };

/**
 * Server Action to merge a duplicate feedback post into a master canonical post.
 * Enforces owner/admin RBAC and performs atomic transfers of unique upvotes and subscribers.
 * Triggers cache revalidation for workspace paths, post views and roadmap cache tags.
 */
export async function mergePostsAction(
  workspaceId: string,
  secondaryPostId: string,
  masterPostId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<MergePostsResult> {
  const activeDb = dbClient ?? db;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    workspaceId.trim()
  );
  const effectiveActor =
    actor ??
    (await getActorContext({
      workspaceId: isUuid ? workspaceId : undefined,
      workspaceSlug: isUuid ? undefined : workspaceId,
      dbClient: activeDb,
    }));

  const result = await mergePosts(
    workspaceId,
    secondaryPostId,
    masterPostId,
    effectiveActor,
    activeDb
  );

  if (result.success) {
    try {
      revalidatePath(`/w/${result.workspace.slug}`);
      revalidatePath(`/w/${result.workspace.slug}/p/${secondaryPostId}`);
      revalidatePath(`/w/${result.workspace.slug}/p/${masterPostId}`);
      revalidatePath(`/w/${result.workspace.slug}/roadmap`);
      if (result.secondaryBoard?.slug) {
        revalidatePath(`/w/${result.workspace.slug}/b/${result.secondaryBoard.slug}`);
      }
      if (result.masterBoard?.slug) {
        revalidatePath(`/w/${result.workspace.slug}/b/${result.masterBoard.slug}`);
      }
    } catch {
      // Path revalidation is gracefully skipped in non-request environments
    }

    try {
      revalidateTag(`post:${secondaryPostId}`);
      revalidateTag(`post:${masterPostId}`);
      revalidateTag(`workspace:${result.workspace.id}:posts`);
      revalidateTag(`workspace:${result.workspace.slug}:posts`);
      revalidateTag(`workspace:${result.workspace.id}:roadmap`);
      revalidateTag(`workspace:${result.workspace.slug}:roadmap`);
      revalidateTag(getRoadmapCacheTag(result.workspace.id));
      if (result.masterBoard?.id) {
        revalidateTag(getRoadmapCacheTag(result.workspace.id, result.masterBoard.id));
      }
      if (result.secondaryBoard?.id) {
        revalidateTag(getRoadmapCacheTag(result.workspace.id, result.secondaryBoard.id));
      }
    } catch {
      // Tag revalidation is gracefully skipped in non-request environments
    }
  }

  return result;
}
