"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  createPost,
  searchDuplicates,
  getPostDetail,
  getPostsForBoard,
  type CreatePostResult,
  type SearchDuplicatesResult,
  type GetPostDetailResult,
  type GetPostsForBoardResult,
} from "@/services/posts";
import { getActorContext } from "@/lib/auth-context";
import type { ActorContext } from "@/services/boards";
import type { PostStatus } from "@/db/schema/posts";

export type {
  CreatePostResult,
  SearchDuplicatesResult,
  GetPostDetailResult,
  GetPostsForBoardResult,
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
