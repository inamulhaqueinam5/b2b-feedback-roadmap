"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  createComment,
  getPostComments,
  updateComment,
  deleteComment,
  type CreateCommentResult,
  type GetPostCommentsResult,
  type UpdateCommentResult,
  type DeleteCommentResult,
  type CommentItem,
} from "@/services/comments";
import { getActorContext } from "@/lib/auth-context";
import type { ActorContext } from "@/services/boards";
import type { DbClient } from "@/db/repositories/workspaces";

export type {
  CreateCommentResult,
  GetPostCommentsResult,
  UpdateCommentResult,
  DeleteCommentResult,
  CommentItem,
};

/**
 * Server action to create a new comment on a post.
 */
export async function createCommentAction(
  workspaceId: string,
  postId: string,
  content: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<CreateCommentResult> {
  const activeDb = dbClient ?? db;
  const effectiveActor =
    actor ?? (await getActorContext({ workspaceId, dbClient: activeDb }));
  const result = await createComment(
    workspaceId,
    postId,
    { content },
    effectiveActor,
    activeDb
  );

  try {
    if (result.success) {
      revalidatePath(`/w/${workspaceId}`);
    }
  } catch {
    // revalidatePath safely ignored outside Next.js request runtime
  }

  return result;
}

/**
 * Server action to update comment content within the 15-minute author window or via admin moderation.
 */
export async function updateCommentAction(
  workspaceId: string,
  commentId: string,
  content: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<UpdateCommentResult> {
  const activeDb = dbClient ?? db;
  const effectiveActor =
    actor ?? (await getActorContext({ workspaceId, dbClient: activeDb }));
  const result = await updateComment(
    workspaceId,
    commentId,
    { content },
    effectiveActor,
    activeDb
  );

  try {
    if (result.success) {
      revalidatePath(`/w/${workspaceId}`);
    }
  } catch {
    // revalidatePath safely ignored outside Next.js request runtime
  }

  return result;
}

/**
 * Server action to delete a comment.
 */
export async function deleteCommentAction(
  workspaceId: string,
  commentId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<DeleteCommentResult> {
  const activeDb = dbClient ?? db;
  const effectiveActor =
    actor ?? (await getActorContext({ workspaceId, dbClient: activeDb }));
  const result = await deleteComment(
    workspaceId,
    commentId,
    effectiveActor,
    activeDb
  );

  try {
    if (result.success) {
      revalidatePath(`/w/${workspaceId}`);
    }
  } catch {
    // revalidatePath safely ignored outside Next.js request runtime
  }

  return result;
}

/**
 * Server action to retrieve all comments for a post thread.
 */
export async function getPostCommentsAction(
  workspaceId: string,
  postId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<GetPostCommentsResult> {
  const activeDb = dbClient ?? db;
  const effectiveActor =
    actor ?? (await getActorContext({ workspaceId, dbClient: activeDb }));
  return getPostComments(workspaceId, postId, effectiveActor, activeDb);
}

export {
  createInternalNoteAction,
  getInternalNotesAction,
} from "./internal-notes";
