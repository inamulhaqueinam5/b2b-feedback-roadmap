import crypto from "crypto";
import {
  createUserRecord,
  getUserRecordById,
  getUserRecordByEmail,
  updateUserRecord,
  createAccountRecord,
  getAccountRecordByProvider,
  createSessionRecord,
  getSessionRecordByToken,
  deleteSessionRecord,
  createVerificationTokenRecord,
  getVerificationTokenByToken,
  deleteVerificationTokenRecord,
  createWorkspaceMemberRecord,
  getWorkspaceMemberRecord,
  updateWorkspaceMemberRole as updateMemberRoleInRepo,
  removeWorkspaceMemberRecord,
  listWorkspaceMembers,
} from "@/db/repositories/auth";
import { getWorkspaceRecordBySlug } from "@/db/repositories/workspaces";
import type { DbClient } from "@/db/repositories/workspaces";
import type {
  User,
  Session,
  WorkspaceMember,
  WorkspaceMemberRole,
} from "@/db/schema/auth";
import type { WorkspaceRole } from "@/services/boards";
import {
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  oauthSignInSchema,
  type OAuthSignInInput,
} from "@/lib/validation/auth";

export const SESSION_COOKIE_NAME = "session_token";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const MAGIC_LINK_EXPIRY_MINUTES = 15;

export type RequestMagicLinkResult =
  | { success: true; email: string; token: string; expiresAt: Date }
  | { success: false; error: string };

export type VerifyMagicLinkResult =
  | { success: true; user: User; sessionToken: string; expiresAt: Date }
  | { success: false; error: string };

export type OAuthSignInResult =
  | { success: true; user: User; sessionToken: string; expiresAt: Date }
  | { success: false; error: string };

export type ValidateSessionResult =
  | { valid: true; session: Session; user: User }
  | { valid: false; expired?: boolean };

export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

export async function requestMagicLink(
  email: string,
  db: DbClient
): Promise<RequestMagicLinkResult> {
  const parsed = magicLinkRequestSchema.safeParse({ email });
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message ?? "Invalid email address";
    return { success: false, error: errorMsg };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const token = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  await createVerificationTokenRecord(db, {
    identifier: normalizedEmail,
    token,
    expiresAt,
  });

  return {
    success: true,
    email: normalizedEmail,
    token,
    expiresAt,
  };
}

export async function verifyMagicLink(
  token: string,
  email: string | undefined,
  db: DbClient
): Promise<VerifyMagicLinkResult> {
  const parsed = magicLinkVerifySchema.safeParse({ token, email });
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message ?? "Invalid verification parameters";
    return { success: false, error: errorMsg };
  }

  const record = await getVerificationTokenByToken(db, parsed.data.token);
  if (!record) {
    return { success: false, error: "Invalid or expired verification token" };
  }

  if (new Date() > record.expiresAt) {
    await deleteVerificationTokenRecord(db, record.token);
    return { success: false, error: "Verification token has expired" };
  }

  if (email && record.identifier.toLowerCase() !== email.trim().toLowerCase()) {
    return { success: false, error: "Email does not match verification token" };
  }

  // Consume verification token immediately to prevent reuse
  await deleteVerificationTokenRecord(db, record.token);

  // Locate or create user record
  let user = await getUserRecordByEmail(db, record.identifier);
  if (!user) {
    user = await createUserRecord(db, {
      email: record.identifier,
      emailVerified: new Date(),
    });
  } else if (!user.emailVerified) {
    const updated = await updateUserRecord(db, user.id, {
      emailVerified: new Date(),
    });
    if (updated) {
      user = updated;
    }
  }

  // Generate persistent authenticated session
  const sessionToken = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await createSessionRecord(db, {
    sessionToken,
    userId: user.id,
    expiresAt,
  });

  return {
    success: true,
    user,
    sessionToken,
    expiresAt,
  };
}

export async function signInWithOAuth(
  input: OAuthSignInInput,
  db: DbClient
): Promise<OAuthSignInResult> {
  const parsed = oauthSignInSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message ?? "Invalid OAuth input";
    return { success: false, error: errorMsg };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const existingAccount = await getAccountRecordByProvider(
    db,
    parsed.data.provider,
    parsed.data.providerAccountId
  );

  let user: User | null = null;

  if (existingAccount) {
    user = await getUserRecordById(db, existingAccount.userId);
  }

  if (!user) {
    // Check if user exists by email address
    user = await getUserRecordByEmail(db, normalizedEmail);

    if (!user) {
      user = await createUserRecord(db, {
        email: normalizedEmail,
        name: parsed.data.name ?? null,
        image: parsed.data.image ?? null,
        emailVerified: new Date(),
      });
    }

    // Link provider account to user if not already linked
    if (!existingAccount) {
      await createAccountRecord(db, {
        userId: user.id,
        type: "oauth",
        provider: parsed.data.provider,
        providerAccountId: parsed.data.providerAccountId,
      });
    }
  }

  // Create active session
  const sessionToken = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await createSessionRecord(db, {
    sessionToken,
    userId: user.id,
    expiresAt,
  });

  return {
    success: true,
    user,
    sessionToken,
    expiresAt,
  };
}

export async function validateSession(
  sessionToken: string,
  db: DbClient
): Promise<ValidateSessionResult> {
  if (!sessionToken || sessionToken.trim() === "") {
    return { valid: false };
  }

  const result = await getSessionRecordByToken(db, sessionToken.trim());
  if (!result) {
    return { valid: false };
  }

  if (new Date() > result.session.expiresAt) {
    await deleteSessionRecord(db, sessionToken);
    return { valid: false, expired: true };
  }

  return {
    valid: true,
    session: result.session,
    user: result.user,
  };
}

export async function revokeSession(
  sessionToken: string,
  db: DbClient
): Promise<{ success: boolean }> {
  if (!sessionToken || sessionToken.trim() === "") {
    return { success: false };
  }

  const deleted = await deleteSessionRecord(db, sessionToken.trim());
  return { success: deleted };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getUserWorkspaceRole(
  userId: string,
  workspaceIdOrSlug: string,
  db: DbClient
): Promise<WorkspaceRole> {
  if (!userId || !workspaceIdOrSlug) {
    return "visitor";
  }

  if (!UUID_REGEX.test(userId)) {
    return "visitor";
  }

  let resolvedWorkspaceId = workspaceIdOrSlug;

  if (!UUID_REGEX.test(workspaceIdOrSlug)) {
    const workspace = await getWorkspaceRecordBySlug(db, workspaceIdOrSlug);
    if (!workspace) {
      return "visitor";
    }
    resolvedWorkspaceId = workspace.id;
  }

  const member = await getWorkspaceMemberRecord(db, resolvedWorkspaceId, userId);
  if (!member) {
    return "visitor";
  }

  return member.role as WorkspaceRole;
}

export async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole = "member",
  db: DbClient
): Promise<WorkspaceMember> {
  const existing = await getWorkspaceMemberRecord(db, workspaceId, userId);
  if (existing) {
    if (existing.role !== role) {
      const updated = await updateMemberRoleInRepo(db, workspaceId, userId, role);
      if (updated) return updated;
    }
    return existing;
  }

  return createWorkspaceMemberRecord(db, {
    workspaceId,
    userId,
    role,
  });
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole,
  db: DbClient
): Promise<WorkspaceMember | null> {
  return updateMemberRoleInRepo(db, workspaceId, userId, role);
}

export async function removeWorkspaceMember(
  workspaceId: string,
  userId: string,
  db: DbClient
): Promise<boolean> {
  return removeWorkspaceMemberRecord(db, workspaceId, userId);
}

export async function listWorkspaceMembersWithUsers(
  workspaceId: string,
  db: DbClient
): Promise<Array<WorkspaceMember & { user: User }>> {
  return listWorkspaceMembers(db, workspaceId);
}
