import { and, eq, asc, not } from "drizzle-orm";
import { boards, type Board } from "@/db/schema/boards";
import type { CreateBoardInput, UpdateBoardInput } from "@/lib/validation/board";
import type { DbClient } from "@/db/repositories/workspaces";

export async function createBoardRecord(
  db: DbClient,
  workspaceId: string,
  input: CreateBoardInput
): Promise<Board> {
  const [created] = await db
    .insert(boards)
    .values({
      workspaceId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      icon: input.icon ?? "message-square",
      isPrivate: input.isPrivate ?? false,
      isArchived: false,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  return created;
}

export async function getBoardRecordBySlug(
  db: DbClient,
  workspaceId: string,
  slug: string
): Promise<Board | null> {
  const [found] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.workspaceId, workspaceId), eq(boards.slug, slug)))
    .limit(1);

  return found ?? null;
}

export async function getBoardRecordById(
  db: DbClient,
  workspaceId: string,
  boardId: string
): Promise<Board | null> {
  const [found] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.workspaceId, workspaceId), eq(boards.id, boardId)))
    .limit(1);

  return found ?? null;
}

export async function isBoardSlugAvailable(
  db: DbClient,
  workspaceId: string,
  slug: string,
  excludeBoardId?: string
): Promise<boolean> {
  const conditions = [
    eq(boards.workspaceId, workspaceId),
    eq(boards.slug, slug),
  ];

  if (excludeBoardId) {
    conditions.push(not(eq(boards.id, excludeBoardId)));
  }

  const [found] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(...conditions))
    .limit(1);

  return !found;
}

export interface ListBoardsOptions {
  includePrivate?: boolean;
  includeArchived?: boolean;
}

export async function listBoardsForWorkspace(
  db: DbClient,
  workspaceId: string,
  options: ListBoardsOptions = {}
): Promise<Board[]> {
  const { includePrivate = false, includeArchived = false } = options;

  const conditions = [eq(boards.workspaceId, workspaceId)];

  if (!includeArchived) {
    conditions.push(eq(boards.isArchived, false));
  }

  if (!includePrivate) {
    conditions.push(eq(boards.isPrivate, false));
  }

  const results = await db
    .select()
    .from(boards)
    .where(and(...conditions))
    .orderBy(asc(boards.sortOrder), asc(boards.createdAt));

  return results;
}

export async function updateBoardRecord(
  db: DbClient,
  workspaceId: string,
  boardId: string,
  input: UpdateBoardInput
): Promise<Board | null> {
  const updateData: Partial<typeof boards.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.slug !== undefined) updateData.slug = input.slug;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.icon !== undefined) updateData.icon = input.icon;
  if (input.isPrivate !== undefined) updateData.isPrivate = input.isPrivate;
  if (input.isArchived !== undefined) updateData.isArchived = input.isArchived;
  if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

  const [updated] = await db
    .update(boards)
    .set(updateData)
    .where(and(eq(boards.workspaceId, workspaceId), eq(boards.id, boardId)))
    .returning();

  return updated ?? null;
}

export async function archiveBoardRecord(
  db: DbClient,
  workspaceId: string,
  boardId: string
): Promise<boolean> {
  const [updated] = await db
    .update(boards)
    .set({
      isArchived: true,
      updatedAt: new Date(),
    })
    .where(and(eq(boards.workspaceId, workspaceId), eq(boards.id, boardId)))
    .returning({ id: boards.id });

  return Boolean(updated);
}

export async function reorderBoardRecords(
  db: DbClient,
  workspaceId: string,
  items: { id: string; sortOrder: number }[]
): Promise<boolean> {
  for (const item of items) {
    await db
      .update(boards)
      .set({
        sortOrder: item.sortOrder,
        updatedAt: new Date(),
      })
      .where(and(eq(boards.workspaceId, workspaceId), eq(boards.id, item.id)));
  }

  return true;
}
