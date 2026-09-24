import {
  createBoardSchema,
  updateBoardSchema,
  reorderBoardsSchema,
  type CreateBoardInput,
  type UpdateBoardInput,
  type ReorderBoardsInput,
} from "@/lib/validation/board";
import {
  createBoardRecord,
  getBoardRecordBySlug,
  getBoardRecordById,
  isBoardSlugAvailable,
  listBoardsForWorkspace,
  updateBoardRecord,
  archiveBoardRecord,
  reorderBoardRecords,
} from "@/db/repositories/boards";
import { getWorkspaceRecordBySlug, type DbClient } from "@/db/repositories/workspaces";
import type { Board } from "@/db/schema/boards";
import type { Workspace } from "@/db/schema/workspaces";

export type WorkspaceRole = "owner" | "admin" | "member" | "guest" | "visitor";

export interface ActorContext {
  userId?: string;
  role: WorkspaceRole;
}

export function canManageBoards(actor?: ActorContext): boolean {
  if (!actor) return false;
  return actor.role === "owner" || actor.role === "admin";
}

export function canViewPrivateBoards(actor?: ActorContext): boolean {
  if (!actor) return false;
  return (
    actor.role === "owner" ||
    actor.role === "admin" ||
    actor.role === "member"
  );
}

export type GetBoardsResult =
  | { success: true; boards: Board[]; workspace: Workspace }
  | { success: false; error: string };

export async function getBoardsForWorkspace(
  workspaceSlug: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<GetBoardsResult> {
  const cleanSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanSlug);

  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const includePrivate = canViewPrivateBoards(actor);
  const boards = await listBoardsForWorkspace(db, workspace.id, {
    includePrivate,
    includeArchived: false,
  });

  return { success: true, boards, workspace };
}

export type GetBoardResult =
  | { success: true; board: Board; workspace: Workspace }
  | { success: false; error: string };

export async function getBoardBySlug(
  workspaceSlug: string,
  boardSlug: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<GetBoardResult> {
  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const cleanBoardSlug = boardSlug.trim().toLowerCase();

  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const board = await getBoardRecordBySlug(db, workspace.id, cleanBoardSlug);
  if (!board || board.isArchived) {
    return { success: false, error: "Board not found" };
  }

  if (board.isPrivate && !canViewPrivateBoards(actor)) {
    return { success: false, error: "Board not found" };
  }

  return { success: true, board, workspace };
}

export type CreateBoardResult =
  | { success: true; board: Board }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createBoard(
  workspaceSlug: string,
  input: unknown,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<CreateBoardResult> {
  if (!canManageBoards(actor)) {
    return {
      success: false,
      error: "Unauthorized: Only workspace admins can create boards",
    };
  }

  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const parsed = createBoardSchema.safeParse(input);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((i) => i.message).join(", ");
    return {
      success: false,
      error: errorMessages,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const isAvailable = await isBoardSlugAvailable(
    db,
    workspace.id,
    parsed.data.slug
  );
  if (!isAvailable) {
    return {
      success: false,
      error: "A board with this slug already exists in this workspace",
    };
  }

  try {
    const board = await createBoardRecord(db, workspace.id, parsed.data);
    return { success: true, board };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === "23505" || err.message?.includes("unique")) {
      return {
        success: false,
        error: "A board with this slug already exists in this workspace",
      };
    }
    return {
      success: false,
      error: "Failed to create board. Please try again.",
    };
  }
}

export type UpdateBoardResult =
  | { success: true; board: Board }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function updateBoard(
  workspaceSlug: string,
  boardId: string,
  input: unknown,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<UpdateBoardResult> {
  if (!canManageBoards(actor)) {
    return {
      success: false,
      error: "Unauthorized: Only workspace admins can manage boards",
    };
  }

  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const existingBoard = await getBoardRecordById(db, workspace.id, boardId);
  if (!existingBoard) {
    return { success: false, error: "Board not found in this workspace" };
  }

  const parsed = updateBoardSchema.safeParse(input);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((i) => i.message).join(", ");
    return {
      success: false,
      error: errorMessages,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.slug && parsed.data.slug !== existingBoard.slug) {
    const isAvailable = await isBoardSlugAvailable(
      db,
      workspace.id,
      parsed.data.slug,
      boardId
    );
    if (!isAvailable) {
      return {
        success: false,
        error: "A board with this slug already exists in this workspace",
      };
    }
  }

  try {
    const updated = await updateBoardRecord(
      db,
      workspace.id,
      boardId,
      parsed.data
    );
    if (!updated) {
      return { success: false, error: "Failed to update board" };
    }
    return { success: true, board: updated };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === "23505" || err.message?.includes("unique")) {
      return {
        success: false,
        error: "A board with this slug already exists in this workspace",
      };
    }
    return {
      success: false,
      error: "Failed to update board. Please try again.",
    };
  }
}

export type ArchiveBoardResult =
  | { success: true }
  | { success: false; error: string };

export async function archiveBoard(
  workspaceSlug: string,
  boardId: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<ArchiveBoardResult> {
  if (!canManageBoards(actor)) {
    return {
      success: false,
      error: "Unauthorized: Only workspace admins can archive boards",
    };
  }

  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const archived = await archiveBoardRecord(db, workspace.id, boardId);
  if (!archived) {
    return { success: false, error: "Board not found or could not be archived" };
  }

  return { success: true };
}

export type ReorderBoardsResult =
  | { success: true }
  | { success: false; error: string };

export async function reorderBoards(
  workspaceSlug: string,
  input: unknown,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<ReorderBoardsResult> {
  if (!canManageBoards(actor)) {
    return {
      success: false,
      error: "Unauthorized: Only workspace admins can reorder boards",
    };
  }

  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const parsed = reorderBoardsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  await reorderBoardRecords(db, workspace.id, parsed.data.items);
  return { success: true };
}

export async function seedDefaultBoardsIfEmpty(
  workspaceId: string,
  db: DbClient
): Promise<Board[]> {
  const existing = await listBoardsForWorkspace(db, workspaceId, {
    includePrivate: true,
    includeArchived: false,
  });

  if (existing.length > 0) {
    return existing;
  }

  const defaultBoards: CreateBoardInput[] = [
    {
      name: "Feature Requests",
      slug: "feature-requests",
      description: "Suggest and vote on new ideas and product capabilities.",
      icon: "sparkles",
      isPrivate: false,
      sortOrder: 0,
    },
    {
      name: "Bug Reports",
      slug: "bug-reports",
      description: "Report unexpected behavior, performance issues and glitches.",
      icon: "bug",
      isPrivate: false,
      sortOrder: 1,
    },
  ];

  const created: Board[] = [];
  for (const item of defaultBoards) {
    const board = await createBoardRecord(db, workspaceId, item);
    created.push(board);
  }

  return created;
}
