import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import {
  createUserRecord,
  getUserRecordById,
  getUserRecordByEmail,
  updateUserRecord,
  createAccountRecord,
  getAccountRecordByProvider,
  listAccountsByUserId,
  createSessionRecord,
  getSessionRecordByToken,
  deleteSessionRecord,
  deleteSessionsByUserId,
  createVerificationTokenRecord,
  getVerificationTokenByToken,
  deleteVerificationTokenRecord,
  createWorkspaceMemberRecord,
  getWorkspaceMemberRecord,
  listWorkspaceMembers,
  updateWorkspaceMemberRole,
  removeWorkspaceMemberRecord,
} from "@/db/repositories/auth";
import type { Workspace } from "@/db/schema/workspaces";

describe("Auth Repository Data Operations & Constraints", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let testWorkspace: Workspace;

  beforeAll(async () => {
    db = await getTestDb();
    testWorkspace = await createWorkspaceRecord(db, {
      name: "Auth Test Workspace",
      slug: "auth-test-workspace",
    });
  });

  describe("User Records", () => {
    it("creates a user record and retrieves it by ID and email", async () => {
      const user = await createUserRecord(db, {
        email: "alice@acme.com",
        name: "Alice Builder",
        image: "https://example.com/avatar.png",
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe("alice@acme.com");
      expect(user.name).toBe("Alice Builder");
      expect(user.image).toBe("https://example.com/avatar.png");
      expect(user.emailVerified).toBeNull();

      const foundById = await getUserRecordById(db, user.id);
      expect(foundById).not.toBeNull();
      expect(foundById?.email).toBe("alice@acme.com");

      // Verify case-insensitive lookup
      const foundByEmail = await getUserRecordByEmail(db, "ALICE@acme.com");
      expect(foundByEmail).not.toBeNull();
      expect(foundByEmail?.id).toBe(user.id);
    });

    it("updates user record fields including emailVerified timestamp", async () => {
      const user = await createUserRecord(db, {
        email: "bob@acme.com",
        name: "Bob Initial",
      });

      const verifyDate = new Date();
      const updated = await updateUserRecord(db, user.id, {
        name: "Bob Updated",
        emailVerified: verifyDate,
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe("Bob Updated");
      expect(updated?.emailVerified).not.toBeNull();
    });

    it("enforces unique constraint on user emails", async () => {
      await createUserRecord(db, {
        email: "charlie@acme.com",
        name: "Charlie Original",
      });

      await expect(
        createUserRecord(db, {
          email: "charlie@acme.com",
          name: "Charlie Duplicate",
        })
      ).rejects.toThrow();
    });
  });

  describe("Account Records", () => {
    it("creates and links an OAuth provider account to a user", async () => {
      const user = await createUserRecord(db, {
        email: "oauth-user@acme.com",
        name: "OAuth User",
      });

      const account = await createAccountRecord(db, {
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: "google-acc-12345",
      });

      expect(account.id).toBeDefined();
      expect(account.userId).toBe(user.id);
      expect(account.provider).toBe("google");

      const found = await getAccountRecordByProvider(
        db,
        "google",
        "google-acc-12345"
      );
      expect(found).not.toBeNull();
      expect(found?.userId).toBe(user.id);

      const accounts = await listAccountsByUserId(db, user.id);
      expect(accounts.length).toBe(1);
      expect(accounts[0].provider).toBe("google");
    });
  });

  describe("Session Records", () => {
    it("creates, queries and deletes user sessions", async () => {
      const user = await createUserRecord(db, {
        email: "session-user@acme.com",
        name: "Session User",
      });

      const expiresAt = new Date(Date.now() + 3600 * 1000);
      const session = await createSessionRecord(db, {
        sessionToken: "sess_token_test_abc",
        userId: user.id,
        expiresAt,
      });

      expect(session.id).toBeDefined();
      expect(session.sessionToken).toBe("sess_token_test_abc");

      const sessionWithUser = await getSessionRecordByToken(
        db,
        "sess_token_test_abc"
      );
      expect(sessionWithUser).not.toBeNull();
      expect(sessionWithUser?.session.sessionToken).toBe("sess_token_test_abc");
      expect(sessionWithUser?.user.email).toBe("session-user@acme.com");

      const deleted = await deleteSessionRecord(db, "sess_token_test_abc");
      expect(deleted).toBe(true);

      const queryAfterDelete = await getSessionRecordByToken(
        db,
        "sess_token_test_abc"
      );
      expect(queryAfterDelete).toBeNull();
    });

    it("deletes all sessions for a specific user ID", async () => {
      const user = await createUserRecord(db, {
        email: "multi-session@acme.com",
      });

      const expiresAt = new Date(Date.now() + 3600 * 1000);
      await createSessionRecord(db, {
        sessionToken: "token_1",
        userId: user.id,
        expiresAt,
      });
      await createSessionRecord(db, {
        sessionToken: "token_2",
        userId: user.id,
        expiresAt,
      });

      const count = await deleteSessionsByUserId(db, user.id);
      expect(count).toBe(2);

      const check1 = await getSessionRecordByToken(db, "token_1");
      const check2 = await getSessionRecordByToken(db, "token_2");
      expect(check1).toBeNull();
      expect(check2).toBeNull();
    });
  });

  describe("Verification Token Records", () => {
    it("creates, retrieves and consumes verification tokens", async () => {
      const expiresAt = new Date(Date.now() + 900 * 1000);
      const token = await createVerificationTokenRecord(db, {
        identifier: "verify-me@acme.com",
        token: "verification_code_xyz",
        expiresAt,
      });

      expect(token.identifier).toBe("verify-me@acme.com");
      expect(token.token).toBe("verification_code_xyz");

      const retrieved = await getVerificationTokenByToken(
        db,
        "verification_code_xyz"
      );
      expect(retrieved).not.toBeNull();
      expect(retrieved?.identifier).toBe("verify-me@acme.com");

      const deleted = await deleteVerificationTokenRecord(
        db,
        "verification_code_xyz"
      );
      expect(deleted).toBe(true);

      const afterDelete = await getVerificationTokenByToken(
        db,
        "verification_code_xyz"
      );
      expect(afterDelete).toBeNull();
    });
  });

  describe("Workspace Membership Records", () => {
    it("adds a member, updates their role and lists members with user profiles", async () => {
      const user = await createUserRecord(db, {
        email: "member@acme.com",
        name: "Workspace Member",
      });

      const member = await createWorkspaceMemberRecord(db, {
        workspaceId: testWorkspace.id,
        userId: user.id,
        role: "member",
      });

      expect(member.role).toBe("member");
      expect(member.workspaceId).toBe(testWorkspace.id);

      const found = await getWorkspaceMemberRecord(
        db,
        testWorkspace.id,
        user.id
      );
      expect(found).not.toBeNull();
      expect(found?.role).toBe("member");

      const updated = await updateWorkspaceMemberRole(
        db,
        testWorkspace.id,
        user.id,
        "admin"
      );
      expect(updated?.role).toBe("admin");

      const membersList = await listWorkspaceMembers(db, testWorkspace.id);
      const memberEntry = membersList.find((m) => m.userId === user.id);
      expect(memberEntry).toBeDefined();
      expect(memberEntry?.role).toBe("admin");
      expect(memberEntry?.user.name).toBe("Workspace Member");

      const removed = await removeWorkspaceMemberRecord(
        db,
        testWorkspace.id,
        user.id
      );
      expect(removed).toBe(true);

      const checkRemoved = await getWorkspaceMemberRecord(
        db,
        testWorkspace.id,
        user.id
      );
      expect(checkRemoved).toBeNull();
    });

    it("enforces uniqueness of (workspaceId, userId) pair", async () => {
      const user = await createUserRecord(db, {
        email: "dupe-member@acme.com",
      });

      await createWorkspaceMemberRecord(db, {
        workspaceId: testWorkspace.id,
        userId: user.id,
        role: "member",
      });

      await expect(
        createWorkspaceMemberRecord(db, {
          workspaceId: testWorkspace.id,
          userId: user.id,
          role: "admin",
        })
      ).rejects.toThrow();
    });
  });
});
