"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  getBoardsForWorkspace,
  getBoardBySlug,
  createBoard,
  updateBoard,
  archiveBoard,
  reorderBoards,
  type ActorContext,
  type GetBoardsResult,
  type GetBoardResult,
  type CreateBoardResult,
  type UpdateBoardResult,
  type ArchiveBoardResult,
  type ReorderBoardsResult,
} from "@/services/boards";
import { getActorContext } from "@/lib/auth-context";

export type {
  ActorContext,
  GetBoardsResult,
  GetBoardResult,
  CreateBoardResult,
  UpdateBoardResult,
  ArchiveBoardResult,
  ReorderBoardsResult,
};

async function executeBoardMutation<T extends { success: boolean }>(
  workspaceSlug: string,
  mutationFn: (actor: ActorContext) => Promise<T>,
  explicitActor?: ActorContext
): Promise<T> {
  const actor = explicitActor ?? (await getActorContext());
  const result = await mutationFn(actor);
  if (result.success) {
    revalidatePath(`/w/${workspaceSlug}`);
  }
  return result;
}

export async function getBoardsAction(
  workspaceSlug: string,
  actor?: ActorContext
): Promise<GetBoardsResult> {
  const effectiveActor = actor ?? (await getActorContext());
  return getBoardsForWorkspace(workspaceSlug, effectiveActor, db);
}

export async function getBoardBySlugAction(
  workspaceSlug: string,
  boardSlug: string,
  actor?: ActorContext
): Promise<GetBoardResult> {
  const effectiveActor = actor ?? (await getActorContext());
  return getBoardBySlug(workspaceSlug, boardSlug, effectiveActor, db);
}

export async function createBoardAction(
  workspaceSlug: string,
  input: unknown,
  actor?: ActorContext
): Promise<CreateBoardResult> {
  return executeBoardMutation(
    workspaceSlug,
    (effectiveActor) => createBoard(workspaceSlug, input, effectiveActor, db),
    actor
  );
}

export async function updateBoardAction(
  workspaceSlug: string,
  boardId: string,
  input: unknown,
  actor?: ActorContext
): Promise<UpdateBoardResult> {
  return executeBoardMutation(
    workspaceSlug,
    (effectiveActor) => updateBoard(workspaceSlug, boardId, input, effectiveActor, db),
    actor
  );
}

export async function archiveBoardAction(
  workspaceSlug: string,
  boardId: string,
  actor?: ActorContext
): Promise<ArchiveBoardResult> {
  return executeBoardMutation(
    workspaceSlug,
    (effectiveActor) => archiveBoard(workspaceSlug, boardId, effectiveActor, db),
    actor
  );
}

export async function reorderBoardsAction(
  workspaceSlug: string,
  input: unknown,
  actor?: ActorContext
): Promise<ReorderBoardsResult> {
  return executeBoardMutation(
    workspaceSlug,
    (effectiveActor) => reorderBoards(workspaceSlug, input, effectiveActor, db),
    actor
  );
}
