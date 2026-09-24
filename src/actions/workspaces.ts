"use server";

import { db } from "@/db";
import {
  validateWorkspaceSlug,
  createWorkspace,
  getWorkspace,
  type ValidateSlugResult,
  type CreateWorkspaceResult,
  type GetWorkspaceResult,
} from "@/services/workspaces";

export type { ValidateSlugResult, CreateWorkspaceResult, GetWorkspaceResult };

export async function validateWorkspaceSlugAction(slug: string): Promise<ValidateSlugResult> {
  return validateWorkspaceSlug(slug, db);
}

export async function createWorkspaceAction(input: unknown): Promise<CreateWorkspaceResult> {
  return createWorkspace(input, db);
}

export async function getWorkspaceAction(slug: string): Promise<GetWorkspaceResult> {
  return getWorkspace(slug, db);
}
