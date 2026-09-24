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
  seedDefaultBoardsIfEmpty,
  type ActorContext,
  type GetBoardsResult,
  type GetBoardResult,
  type CreateBoardResult,
  type UpdateBoardResult,
  type ArchiveBoardResult,
  type ReorderBoardsResult,
} from "@/services/boards";
import { getWorkspaceRecordBySlug } from "@/db/repositories/workspaces";

export type {
  ActorContext,
  GetBoardsResult,
  GetBoardResult,
  CreateBoardResult,
  UpdateBoardResult,
  ArchiveBoardResult,
  ReorderBoardsResult,
};

export async function getBoardsAction(
  workspaceSlug: string,
  actor?: ActorContext
): Promise<GetBoardsResult> {
  const result = await getBoardsForWorkspace(workspaceSlug, actor, db);

  // If this workspace has zero boards yet, seed default starter boards for good UX
  if (result.success && result.boards.length === 0) {
    await seedDefaultBoardsIfEmpty(result.workspace.id, db);
    return getBoardsForWorkspace(workspaceSlug, actor, db);
  }

  return result;
}

export async function getBoardBySlugAction(
  workspaceSlug: string,
  boardSlug: string,
  actor?: ActorContext
): Promise<GetBoardResult> {
  return getBoardBySlug(workspaceSlug, boardSlug, actor, db);
}

export async function createBoardAction(
  workspaceSlug: string,
  input: unknown,
  actor?: ActorContext
): Promise<CreateBoardResult> {
  // If no actor passed in development / direct call, default to admin for management
  const effectiveActor: ActorContext = actor ?? { role: "admin" };
  const result = await createBoard(workspaceSlug, input, effectiveActor, db);
  if (result.success) {
    revalidatePath(`/w/${workspaceSlug}`);
  }
  return result;
}

export async function updateBoardAction(
  workspaceSlug: string,
  boardId: string,
  input: unknown,
  actor?: ActorContext
): Promise<UpdateBoardResult> {
  const effectiveActor: ActorContext = actor ?? { role: "admin" };
  const result = await updateBoard(workspaceSlug, boardId, input, effectiveActor, db);
  if (result.success) {
    revalidatePath(`/w/${workspaceSlug}`);
  }
  return result;
}

export async function archiveBoardAction(
  workspaceSlug: string,
  boardId: string,
  actor?: ActorContext
): Promise<ArchiveBoardResult> {
  const effectiveActor: ActorContext = actor ?? { role: "admin" };
  const result = await archiveBoard(workspaceSlug, boardId, effectiveActor, db);
  if (result.success) {
    revalidatePath(`/w/${workspaceSlug}`);
  }
  return result;
}

export async function reorderBoardsAction(
  workspaceSlug: string,
  input: unknown,
  actor?: ActorContext
): Promise<ReorderBoardsResult> {
  const effectiveActor: ActorContext = actor ?? { role: "admin" };
  const result = await reorderBoards(workspaceSlug, input, effectiveActor, db);
  if (result.success) {
    revalidatePath(`/w/${workspaceSlug}`);
  }
  return result;
}
