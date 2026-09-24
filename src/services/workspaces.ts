import {
  createWorkspaceSchema,
  isValidSlugFormat,
  isReservedSlug,
} from "@/lib/validation/workspace";
import {
  createWorkspaceRecord,
  getWorkspaceRecordBySlug,
  isWorkspaceSlugAvailable,
  type DbClient,
} from "@/db/repositories/workspaces";
import type { Workspace } from "@/db/schema/workspaces";

export type ValidateSlugResult = {
  available: boolean;
  error?: string;
};

export async function validateWorkspaceSlug(
  slug: string,
  db: DbClient
): Promise<ValidateSlugResult> {
  const cleanSlug = slug.trim().toLowerCase();

  if (!isValidSlugFormat(cleanSlug)) {
    return {
      available: false,
      error: "Slug can only contain lowercase letters, numbers and single hyphens",
    };
  }

  if (isReservedSlug(cleanSlug)) {
    return {
      available: false,
      error: "This slug is reserved and cannot be used",
    };
  }

  const isAvailable = await isWorkspaceSlugAvailable(db, cleanSlug);
  if (!isAvailable) {
    return {
      available: false,
      error: "This slug is already taken",
    };
  }

  return { available: true };
}

export type CreateWorkspaceResult =
  | { success: true; workspace: Workspace }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createWorkspace(
  input: unknown,
  db: DbClient
): Promise<CreateWorkspaceResult> {
  const parsed = createWorkspaceSchema.safeParse(input);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((i) => i.message).join(", ");
    return {
      success: false,
      error: errorMessages,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const isAvailable = await isWorkspaceSlugAvailable(db, parsed.data.slug);
  if (!isAvailable) {
    return {
      success: false,
      error: "This slug is already taken",
    };
  }

  try {
    const workspace = await createWorkspaceRecord(db, parsed.data);
    return { success: true, workspace };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === "23505" || err.message?.includes("unique")) {
      return { success: false, error: "This slug is already taken" };
    }
    return { success: false, error: "Failed to create workspace. Please try again." };
  }
}

export type GetWorkspaceResult =
  | { success: true; workspace: Workspace }
  | { success: false; error: string };

export async function getWorkspace(
  slug: string,
  db: DbClient
): Promise<GetWorkspaceResult> {
  const cleanSlug = slug.trim().toLowerCase();

  const workspace = await getWorkspaceRecordBySlug(db, cleanSlug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  return { success: true, workspace };
}
