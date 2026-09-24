import { eq } from "drizzle-orm";
import { workspaces, type Workspace, type NewWorkspace } from "@/db/schema/workspaces";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = any;

export async function createWorkspaceRecord(
  db: DbClient,
  input: {
    name: string;
    slug: string;
    brandColor?: string;
    logoUrl?: string | null;
  }
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

export async function isWorkspaceSlugAvailable(
  db: DbClient,
  slug: string
): Promise<boolean> {
  const existing = await getWorkspaceRecordBySlug(db, slug);
  return existing === null;
}
