"use server";

import { cookies } from "next/headers";
import { db as defaultDb } from "@/db";
import type { DbClient } from "@/db/repositories/workspaces";
import {
  SESSION_COOKIE_NAME,
  requestMagicLink,
  verifyMagicLink,
  signInWithOAuth,
  validateSession,
  revokeSession,
  getUserWorkspaceRole,
  addWorkspaceMember,
} from "@/services/auth";
import type { OAuthSignInInput } from "@/lib/validation/auth";
import type { WorkspaceMemberRole } from "@/db/schema/auth";
import type { WorkspaceRole } from "@/services/boards";

async function getSafeCookieStore() {
  try {
    return await cookies();
  } catch {
    return null;
  }
}

export interface AuthActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export async function requestMagicLinkAction(
  email: string,
  db: DbClient = defaultDb
): Promise<{ success: boolean; email?: string; message?: string; token?: string; error?: string }> {
  const result = await requestMagicLink(email, db);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    email: result.email,
    token: result.token,
    message: "Magic sign-in link has been created and sent",
  };
}

export async function verifyMagicLinkAction(
  token: string,
  email?: string,
  db: DbClient = defaultDb
): Promise<{ success: boolean; user?: UserSummary; error?: string }> {
  const result = await verifyMagicLink(token, email, db);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const cookieStore = await getSafeCookieStore();
  if (cookieStore) {
    cookieStore.set(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });
  }

  return {
    success: true,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      image: result.user.image,
    },
  };
}

export async function signInWithOAuthAction(
  input: OAuthSignInInput,
  db: DbClient = defaultDb
): Promise<{ success: boolean; user?: UserSummary; error?: string }> {
  const result = await signInWithOAuth(input, db);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const cookieStore = await getSafeCookieStore();
  if (cookieStore) {
    cookieStore.set(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });
  }

  return {
    success: true,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      image: result.user.image,
    },
  };
}

export async function signOutAction(
  db: DbClient = defaultDb
): Promise<{ success: boolean }> {
  const cookieStore = await getSafeCookieStore();
  const sessionToken = cookieStore?.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await revokeSession(sessionToken, db);
  }

  if (cookieStore) {
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  return { success: true };
}

export async function getCurrentUserAction(
  db: DbClient = defaultDb
): Promise<{ success: boolean; user: UserSummary | null }> {
  const cookieStore = await getSafeCookieStore();
  const sessionToken = cookieStore?.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return { success: false, user: null };
  }

  const result = await validateSession(sessionToken, db);
  if (!result.valid) {
    return { success: false, user: null };
  }

  return {
    success: true,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      image: result.user.image,
    },
  };
}

export async function getUserRoleAction(
  workspaceSlugOrId: string,
  db: DbClient = defaultDb
): Promise<{ role: WorkspaceRole; userId?: string }> {
  const currentUser = await getCurrentUserAction(db);
  if (!currentUser.success || !currentUser.user) {
    return { role: "visitor" };
  }

  const role = await getUserWorkspaceRole(
    currentUser.user.id,
    workspaceSlugOrId,
    db
  );

  return {
    role,
    userId: currentUser.user.id,
  };
}

export async function addWorkspaceMemberAction(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole = "member",
  db: DbClient = defaultDb
): Promise<{ success: boolean; member?: unknown; error?: string }> {
  try {
    const member = await addWorkspaceMember(workspaceId, userId, role, db);
    return { success: true, member };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add member";
    return { success: false, error: msg };
  }
}
