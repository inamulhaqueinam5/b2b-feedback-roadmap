"use server";

import { db as defaultDb } from "@/db";
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

export async function validateWorkspaceSlugAction(
  slug: string,
  customDb?: DbClient
): Promise<ValidateSlugResult> {
  const database = customDb ?? defaultDb;
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

  const isAvailable = await isWorkspaceSlugAvailable(database, cleanSlug);
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

export async function createWorkspaceAction(
  input: unknown,
  customDb?: DbClient
): Promise<CreateWorkspaceResult> {
  const database = customDb ?? defaultDb;

  const parsed = createWorkspaceSchema.safeParse(input);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((i) => i.message).join(", ");
    return {
      success: false,
      error: errorMessages,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const isAvailable = await isWorkspaceSlugAvailable(database, parsed.data.slug);
  if (!isAvailable) {
    return {
      success: false,
      error: "This slug is already taken",
    };
  }

  try {
    const workspace = await createWorkspaceRecord(database, parsed.data);
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

export async function getWorkspaceAction(
  slug: string,
  customDb?: DbClient
): Promise<GetWorkspaceResult> {
  const database = customDb ?? defaultDb;
  const cleanSlug = slug.trim().toLowerCase();

  const workspace = await getWorkspaceRecordBySlug(database, cleanSlug);
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  return { success: true, workspace };
}
