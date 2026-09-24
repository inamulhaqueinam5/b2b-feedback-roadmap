import { eq, and } from "drizzle-orm";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  workspaceMembers,
  type User,
  type Account,
  type Session,
  type VerificationToken,
  type WorkspaceMember,
  type WorkspaceMemberRole,
} from "@/db/schema/auth";
import type { DbClient } from "@/db/repositories/workspaces";

export async function createUserRecord(
  db: DbClient,
  input: {
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
  }
): Promise<User> {
  const [created] = await db
    .insert(users)
    .values({
      email: input.email.trim().toLowerCase(),
      name: input.name ?? null,
      image: input.image ?? null,
      emailVerified: input.emailVerified ?? null,
    })
    .returning();

  return created;
}

export async function getUserRecordById(
  db: DbClient,
  id: string
): Promise<User | null> {
  const [found] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return found ?? null;
}

export async function getUserRecordByEmail(
  db: DbClient,
  email: string
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const [found] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  return found ?? null;
}

export async function updateUserRecord(
  db: DbClient,
  id: string,
  data: Partial<{
    name: string | null;
    image: string | null;
    emailVerified: Date | null;
  }>
): Promise<User | null> {
  const [updated] = await db
    .update(users)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  return updated ?? null;
}

export async function createAccountRecord(
  db: DbClient,
  input: {
    userId: string;
    type: string;
    provider: string;
    providerAccountId: string;
  }
): Promise<Account> {
  const [created] = await db
    .insert(accounts)
    .values({
      userId: input.userId,
      type: input.type,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    })
    .returning();

  return created;
}

export async function getAccountRecordByProvider(
  db: DbClient,
  provider: string,
  providerAccountId: string
): Promise<Account | null> {
  const [found] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, provider),
        eq(accounts.providerAccountId, providerAccountId)
      )
    )
    .limit(1);

  return found ?? null;
}

export async function listAccountsByUserId(
  db: DbClient,
  userId: string
): Promise<Account[]> {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
}

export async function createSessionRecord(
  db: DbClient,
  input: {
    sessionToken: string;
    userId: string;
    expiresAt: Date;
  }
): Promise<Session> {
  const [created] = await db
    .insert(sessions)
    .values({
      sessionToken: input.sessionToken,
      userId: input.userId,
      expiresAt: input.expiresAt,
    })
    .returning();

  return created;
}

export async function getSessionRecordByToken(
  db: DbClient,
  sessionToken: string
): Promise<{ session: Session; user: User } | null> {
  const rows = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.sessionToken, sessionToken))
    .limit(1);

  if (!rows || rows.length === 0) {
    return null;
  }

  return rows[0];
}

export async function deleteSessionRecord(
  db: DbClient,
  sessionToken: string
): Promise<boolean> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.sessionToken, sessionToken))
    .returning();

  return deleted.length > 0;
}

export async function deleteSessionsByUserId(
  db: DbClient,
  userId: string
): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning();

  return deleted.length;
}

export async function createVerificationTokenRecord(
  db: DbClient,
  input: {
    identifier: string;
    token: string;
    expiresAt: Date;
  }
): Promise<VerificationToken> {
  const [created] = await db
    .insert(verificationTokens)
    .values({
      identifier: input.identifier.trim().toLowerCase(),
      token: input.token,
      expiresAt: input.expiresAt,
    })
    .returning();

  return created;
}

export async function getVerificationTokenByToken(
  db: DbClient,
  token: string
): Promise<VerificationToken | null> {
  const [found] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .limit(1);

  return found ?? null;
}

export async function deleteVerificationTokenRecord(
  db: DbClient,
  token: string
): Promise<boolean> {
  const deleted = await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .returning();

  return deleted.length > 0;
}

export async function createWorkspaceMemberRecord(
  db: DbClient,
  input: {
    workspaceId: string;
    userId: string;
    role?: WorkspaceMemberRole;
  }
): Promise<WorkspaceMember> {
  const [created] = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role ?? "member",
    })
    .returning();

  return created;
}

export async function getWorkspaceMemberRecord(
  db: DbClient,
  workspaceId: string,
  userId: string
): Promise<WorkspaceMember | null> {
  const [found] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  return found ?? null;
}

export async function listWorkspaceMembers(
  db: DbClient,
  workspaceId: string
): Promise<Array<WorkspaceMember & { user: User }>> {
  const rows = await db
    .select({
      member: workspaceMembers,
      user: users,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return rows.map((r) => ({
    ...r.member,
    user: r.user,
  }));
}

export async function updateWorkspaceMemberRole(
  db: DbClient,
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole
): Promise<WorkspaceMember | null> {
  const [updated] = await db
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .returning();

  return updated ?? null;
}

export async function removeWorkspaceMemberRecord(
  db: DbClient,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const deleted = await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .returning();

  return deleted.length > 0;
}
