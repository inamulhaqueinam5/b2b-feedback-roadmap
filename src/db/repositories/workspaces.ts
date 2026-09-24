import { eq } from "drizzle-orm";
import { workspaces, type Workspace } from "@/db/schema/workspaces";
import type { CreateWorkspaceInput } from "@/lib/validation/workspace";
import type { PgDatabase } from "drizzle-orm/pg-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = PgDatabase<any, any, any>;

export async function createWorkspaceRecord(
  db: DbClient,
  input: CreateWorkspaceInput
): Promise<Workspace> {
  const [created] = await db
    .insert(workspaces)
    .values({
      name: input.name,
      slug: input.slug,
      brandColor: input.brandColor ?? "#0ea5e9",
      logoUrl: input.logoUrl ?? null,
    })
    .returning();

  return created;
}

export async function getWorkspaceRecordBySlug(
  db: DbClient,
  slug: string
): Promise<Workspace | null> {
  const [found] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  return found ?? null;
}

export async function getWorkspaceRecordById(
  db: DbClient,
  id: string
): Promise<Workspace | null> {
  const [found] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);

  return found ?? null;
}

export async function isWorkspaceSlugAvailable(
  db: DbClient,
  slug: string
): Promise<boolean> {
  const existing = await getWorkspaceRecordBySlug(db, slug);
  return existing === null;
}

export async function getWorkspaceRecordByIdOrSlug(
  db: DbClient,
  idOrSlug: string
): Promise<Workspace | null> {
  const clean = idOrSlug.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
  if (isUuid) {
    const byId = await getWorkspaceRecordById(db, clean);
    if (byId) return byId;
  }
  return await getWorkspaceRecordBySlug(db, clean.toLowerCase());
}

