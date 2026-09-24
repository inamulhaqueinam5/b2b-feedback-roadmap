"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import type { DbClient } from "@/db/repositories/workspaces";
import {
  createInternalNote,
  getInternalNotes,
  type CreateInternalNoteResult,
  type GetInternalNotesResult,
  type CommentItem,
} from "@/services/comments";
import {
  updatePostAssociatedMrr,
  type UpdatePostAssociatedMrrResult,
} from "@/services/posts";
import { getActorContext } from "@/lib/auth-context";
import type { ActorContext } from "@/services/boards";

export type {
  CreateInternalNoteResult,
  GetInternalNotesResult,
  UpdatePostAssociatedMrrResult,
  CommentItem,
};

/**
 * Server action to record a private confidential internal note on a post.
 * Strictly restricted to workspace owners and admins.
 */
export async function createInternalNoteAction(
  workspaceId: string,
  postId: string,
  content: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<CreateInternalNoteResult> {
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

  const result = await createInternalNote(
    workspaceId,
    postId,
    { content },
    effectiveActor,
    activeDb
  );

  try {
    if (result.success) {
      revalidatePath(`/w/${workspaceId}`);
      revalidatePath(`/w/${workspaceId}/p/${postId}`);
      revalidateTag(`post:${postId}`);
    }
  } catch {
    // revalidatePath safely ignored outside Next.js request runtime
  }

  return result;
}

/**
 * Server action to retrieve private internal notes for a post.
 * Strictly restricted to workspace owners and admins.
 */
export async function getInternalNotesAction(
  workspaceId: string,
  postId: string,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<GetInternalNotesResult> {
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

  return getInternalNotes(workspaceId, postId, effectiveActor, activeDb);
}

/**
 * Server action to record or update associated customer MRR weighting on a post.
 * Strictly restricted to workspace owners and admins.
 */
export async function updatePostAssociatedMrrAction(
  workspaceId: string,
  postId: string,
  associatedMrr: number | string | null,
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<UpdatePostAssociatedMrrResult> {
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

  const result = await updatePostAssociatedMrr(
    workspaceId,
    postId,
    associatedMrr,
    effectiveActor,
    activeDb
  );

  try {
    if (result.success) {
      revalidatePath(`/w/${result.workspace.slug}`);
      revalidatePath(`/w/${result.workspace.slug}/p/${postId}`);
      revalidateTag(`post:${postId}`);
    }
  } catch {
    // revalidatePath safely ignored outside Next.js request runtime
  }

  return result;
}
