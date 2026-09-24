"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import type { DbClient } from "@/db/repositories/workspaces";
import {
  createPost,
  searchDuplicates,
  getPostDetail,
  getPostsForBoard,
  updatePostStatus,
  type CreatePostResult,
  type SearchDuplicatesResult,
  type GetPostDetailResult,
  type GetPostsForBoardResult,
  type UpdatePostStatusResult,
} from "@/services/posts";
import { getRoadmapCacheTag } from "@/actions/roadmap";
import { getActorContext } from "@/lib/auth-context";
import type { ActorContext } from "@/services/boards";
import type { PostStatus } from "@/db/schema/posts";

export type {
  CreatePostResult,
  SearchDuplicatesResult,
  GetPostDetailResult,
  GetPostsForBoardResult,
  UpdatePostStatusResult,
};

export async function createPostAction(
  workspaceSlug: string,
  input: unknown,
  actor?: ActorContext
): Promise<CreatePostResult> {
  const effectiveActor = actor ?? (await getActorContext({ workspaceSlug }));
  const result = await createPost(workspaceSlug, input, effectiveActor, db);

  if (result.success) {
    revalidatePath(`/w/${workspaceSlug}`);
    revalidatePath(`/w/${workspaceSlug}/b/${result.board.slug}`);
    revalidatePath(`/w/${workspaceSlug}/roadmap`);
  }

  return result;
}

export async function searchDuplicatesAction(
  workspaceSlug: string,
  query: string,
  boardId?: string,
  actor?: ActorContext
): Promise<SearchDuplicatesResult> {
  const effectiveActor = actor ?? (await getActorContext({ workspaceSlug }));
  return searchDuplicates(workspaceSlug, query, { boardId }, effectiveActor, db);
}

export async function getPostDetailAction(
  workspaceSlug: string,
  postId: string,
  actor?: ActorContext
): Promise<GetPostDetailResult> {
  const effectiveActor = actor ?? (await getActorContext({ workspaceSlug }));
  return getPostDetail(workspaceSlug, postId, effectiveActor, db);
}

export async function getPostsForBoardAction(
  workspaceSlug: string,
  boardSlug: string,
  options?: {
    status?: PostStatus;
    sortBy?: "newest" | "top" | "trending";
    limit?: number;
    offset?: number;
  },
  actor?: ActorContext
): Promise<GetPostsForBoardResult> {
  const effectiveActor = actor ?? (await getActorContext({ workspaceSlug }));
  return getPostsForBoard(workspaceSlug, boardSlug, options, effectiveActor, db);
}

/**
 * Server Action to transition post status and record an automated system audit trail comment.
 * Revalidates workspace paths and roadmap cache tags upon successful transitions.
 */
export async function updatePostStatusAction(
  workspaceId: string,
  postId: string,
  newStatus: PostStatus,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<UpdatePostStatusResult> {
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

  const result = await updatePostStatus(
    workspaceId,
    postId,
    newStatus,
    effectiveActor,
    activeDb
  );

  if (result.success) {
    try {
      revalidatePath(`/w/${result.workspace.slug}`);
      revalidatePath(`/w/${result.workspace.slug}/b/${result.board.slug}`);
      revalidatePath(`/w/${result.workspace.slug}/roadmap`);
      revalidatePath(`/w/${result.workspace.slug}/p/${postId}`);
    } catch {
      // Path revalidation is gracefully skipped in non-request environments
    }

    try {
      revalidateTag(getRoadmapCacheTag(result.workspace.id));
      revalidateTag(getRoadmapCacheTag(result.workspace.id, result.board.id));
      if (workspaceId !== result.workspace.id) {
        revalidateTag(getRoadmapCacheTag(workspaceId));
      }
      revalidateTag(`workspace:${result.workspace.id}:roadmap`);
      revalidateTag(`workspace:${result.workspace.slug}:roadmap`);
      revalidateTag(`post:${postId}`);
    } catch {
      // Tag revalidation is gracefully skipped in non-request environments
    }
  }

  return result;
}
