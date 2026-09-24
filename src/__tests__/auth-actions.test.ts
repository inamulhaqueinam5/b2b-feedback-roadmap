import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import {
  requestMagicLink,
  verifyMagicLink,
  signInWithOAuth,
  validateSession,
  revokeSession,
  getUserWorkspaceRole,
  addWorkspaceMember,
} from "@/services/auth";
import {
  requestMagicLinkAction,
  verifyMagicLinkAction,
  signInWithOAuthAction,
  getCurrentUserAction,
  signOutAction,
} from "@/actions/auth";
import { getActorContext } from "@/lib/auth-context";
import {
  queueUpvoteIntent,
  queueCreatePostIntent,
  getQueuedIntent,
  clearQueuedIntent,
  executeQueuedIntent,
  hasQueuedIntent,
} from "@/lib/intent-capture";
import type { Workspace } from "@/db/schema/workspaces";

describe("Authentication Services, Server Actions & Intent Replay", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;

  beforeAll(async () => {
    db = await getTestDb();
    workspace = await createWorkspaceRecord(db, {
      name: "Acme Product Team",
      slug: "acme-team",
    });
  });

  describe("Passwordless Magic Link Flow", () => {
    it("generates a magic link verification token for a valid email address", async () => {
      const result = await requestMagicLink("founder@startup.io", db);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.email).toBe("founder@startup.io");
        expect(result.token).toBeDefined();
        expect(result.token.length).toBeGreaterThanOrEqual(32);
        expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      }
    });

    it("rejects an invalid email format", async () => {
      const result = await requestMagicLink("not-an-email", db);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/valid email/i);
      }
    });

    it("verifies a token, provisions a user and creates an active session", async () => {
      const linkResult = await requestMagicLink("newuser@domain.com", db);
      expect(linkResult.success).toBe(true);

      if (linkResult.success) {
        const verifyResult = await verifyMagicLink(
          linkResult.token,
          "newuser@domain.com",
          db
        );

        expect(verifyResult.success).toBe(true);
        if (verifyResult.success) {
          expect(verifyResult.user.email).toBe("newuser@domain.com");
          expect(verifyResult.user.emailVerified).not.toBeNull();
          expect(verifyResult.sessionToken).toBeDefined();
          expect(verifyResult.expiresAt.getTime()).toBeGreaterThan(Date.now());

          // Verify session is active
          const sessionCheck = await validateSession(
            verifyResult.sessionToken,
            db
          );
          expect(sessionCheck.valid).toBe(true);
        }
      }
    });

    it("prevents magic link token reuse after initial verification", async () => {
      const linkResult = await requestMagicLink("singleuse@domain.com", db);
      expect(linkResult.success).toBe(true);

      if (linkResult.success) {
        const firstAttempt = await verifyMagicLink(
          linkResult.token,
          "singleuse@domain.com",
          db
        );
        expect(firstAttempt.success).toBe(true);

        const secondAttempt = await verifyMagicLink(
          linkResult.token,
          "singleuse@domain.com",
          db
        );
        expect(secondAttempt.success).toBe(false);
        if (!secondAttempt.success) {
          expect(secondAttempt.error).toMatch(/invalid or expired/i);
        }
      }
    });

    it("rejects verification if the email does not match the token identifier", async () => {
      const linkResult = await requestMagicLink("original@domain.com", db);
      expect(linkResult.success).toBe(true);

      if (linkResult.success) {
        const verifyResult = await verifyMagicLink(
          linkResult.token,
          "different@domain.com",
          db
        );
        expect(verifyResult.success).toBe(false);
        if (!verifyResult.success) {
          expect(verifyResult.error).toMatch(/does not match/i);
        }
      }
    });
  });

  describe("OAuth Mock & Provider Sign-in Flow", () => {
    it("creates a new user and links their provider account upon first OAuth sign-in", async () => {
      const result = await signInWithOAuth(
        {
          provider: "google",
          providerAccountId: "google-sub-98765",
          email: "googleuser@company.com",
          name: "Google Explorer",
          image: "https://lh3.googleusercontent.com/photo.jpg",
        },
        db
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user.email).toBe("googleuser@company.com");
        expect(result.user.name).toBe("Google Explorer");
        expect(result.sessionToken).toBeDefined();

        const sessionCheck = await validateSession(result.sessionToken, db);
        expect(sessionCheck.valid).toBe(true);
      }
    });

    it("logs in an existing user with GitHub OAuth and creates a new session", async () => {
      // First sign in with email
      const firstSignIn = await signInWithOAuth(
        {
          provider: "github",
          providerAccountId: "gh-sub-111",
          email: "dev@github.com",
          name: "Octocat Dev",
        },
        db
      );
      expect(firstSignIn.success).toBe(true);

      // Subsequent sign in with same GitHub provider
      const secondSignIn = await signInWithOAuth(
        {
          provider: "github",
          providerAccountId: "gh-sub-111",
          email: "dev@github.com",
        },
        db
      );
      expect(secondSignIn.success).toBe(true);
      if (firstSignIn.success && secondSignIn.success) {
        expect(secondSignIn.user.id).toBe(firstSignIn.user.id);
        expect(secondSignIn.sessionToken).not.toBe(firstSignIn.sessionToken);
      }
    });
  });

  describe("Session Validation & Revocation", () => {
    it("revokes an active session successfully", async () => {
      const oauth = await signInWithOAuth(
        {
          provider: "google",
          providerAccountId: "google-sub-revocable",
          email: "revocable@example.com",
        },
        db
      );
      expect(oauth.success).toBe(true);

      if (oauth.success) {
        const checkBefore = await validateSession(oauth.sessionToken, db);
        expect(checkBefore.valid).toBe(true);

        const revokeResult = await revokeSession(oauth.sessionToken, db);
        expect(revokeResult.success).toBe(true);

        const checkAfter = await validateSession(oauth.sessionToken, db);
        expect(checkAfter.valid).toBe(false);
      }
    });
  });

  describe("Workspace Membership & RBAC Role Resolution", () => {
    it("correctly identifies owner, admin, member, guest and visitor roles", async () => {
      const ownerUser = await signInWithOAuth(
        {
          provider: "google",
          providerAccountId: "g-owner-1",
          email: "owner@company.com",
        },
        db
      );
      const adminUser = await signInWithOAuth(
        {
          provider: "google",
          providerAccountId: "g-admin-1",
          email: "admin@company.com",
        },
        db
      );
      const standardUser = await signInWithOAuth(
        {
          provider: "google",
          providerAccountId: "g-member-1",
          email: "member@company.com",
        },
        db
      );
      const guestUser = await signInWithOAuth(
        {
          provider: "google",
          providerAccountId: "g-guest-1",
          email: "guest@company.com",
        },
        db
      );
      const visitorUser = await signInWithOAuth(
        {
          provider: "google",
          providerAccountId: "g-unaffiliated-1",
          email: "visitor@company.com",
        },
        db
      );

      if (
        ownerUser.success &&
        adminUser.success &&
        standardUser.success &&
        guestUser.success &&
        visitorUser.success
      ) {
        await addWorkspaceMember(workspace.id, ownerUser.user.id, "owner", db);
        await addWorkspaceMember(workspace.id, adminUser.user.id, "admin", db);
        await addWorkspaceMember(workspace.id, standardUser.user.id, "member", db);
        await addWorkspaceMember(workspace.id, guestUser.user.id, "guest", db);

        // Resolve by workspace slug
        const ownerRole = await getUserWorkspaceRole(
          ownerUser.user.id,
          workspace.slug,
          db
        );
        const adminRole = await getUserWorkspaceRole(
          adminUser.user.id,
          workspace.slug,
          db
        );
        const memberRole = await getUserWorkspaceRole(
          standardUser.user.id,
          workspace.slug,
          db
        );
        const guestRole = await getUserWorkspaceRole(
          guestUser.user.id,
          workspace.slug,
          db
        );
        const visitorRole = await getUserWorkspaceRole(
          visitorUser.user.id,
          workspace.slug,
          db
        );

        expect(ownerRole).toBe("owner");
        expect(adminRole).toBe("admin");
        expect(memberRole).toBe("member");
        expect(guestRole).toBe("guest");
        expect(visitorRole).toBe("visitor");

        // Resolve by workspace UUID directly
        const adminRoleById = await getUserWorkspaceRole(
          adminUser.user.id,
          workspace.id,
          db
        );
        expect(adminRoleById).toBe("admin");
      }
    });

    it("returns visitor role for non-existent users or workspaces", async () => {
      const role1 = await getUserWorkspaceRole(
        "non-existent-user",
        workspace.slug,
        db
      );
      expect(role1).toBe("visitor");

      const role2 = await getUserWorkspaceRole(
        "any-user",
        "non-existent-workspace-slug",
        db
      );
      expect(role2).toBe("visitor");
    });
  });

  describe("Server Actions Seam Testing", () => {
    it("executes requestMagicLinkAction and verifyMagicLinkAction", async () => {
      const req = await requestMagicLinkAction("action-user@domain.com", db);
      expect(req.success).toBe(true);
      expect(req.token).toBeDefined();

      if (req.token) {
        const verify = await verifyMagicLinkAction(
          req.token,
          "action-user@domain.com",
          db
        );
        expect(verify.success).toBe(true);
        expect(verify.user?.email).toBe("action-user@domain.com");
      }
    });

    it("executes signInWithOAuthAction and signOutAction", async () => {
      const signIn = await signInWithOAuthAction(
        {
          provider: "github",
          providerAccountId: "action-gh-999",
          email: "action-octo@domain.com",
          name: "Action Octocat",
        },
        db
      );
      expect(signIn.success).toBe(true);
      expect(signIn.user?.name).toBe("Action Octocat");

      const signOut = await signOutAction(db);
      expect(signOut.success).toBe(true);
    });

    it("returns null when no authenticated session is present", async () => {
      const res = await getCurrentUserAction(db);
      expect(res.success).toBe(false);
      expect(res.user).toBeNull();
    });
  });

  describe("Actor Context Fallback & In-Memory Seam", () => {
    it("defaults cleanly to visitor role when unauthenticated in test environment", async () => {
      const actor = await getActorContext({
        workspaceSlug: workspace.slug,
        dbClient: db,
      });

      expect(actor.role).toBe("visitor");
      expect(actor.userId).toBeUndefined();
    });
  });

  describe("Intent Capture & Replay Flow", () => {
    beforeAll(() => {
      clearQueuedIntent();
    });

    it("captures, verifies and clears pending upvote actions across visitor transitions", async () => {
      expect(hasQueuedIntent()).toBe(false);

      const queued = queueUpvoteIntent("post-uuid-456", "acme-team");
      expect(queued.id).toBeDefined();
      expect(queued.type).toBe("upvote");
      expect(queued.payload.postId).toBe("post-uuid-456");
      expect(queued.payload.workspaceSlug).toBe("acme-team");
      expect(hasQueuedIntent()).toBe(true);

      const retrieved = getQueuedIntent();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.type).toBe("upvote");

      let replayedPostId: string | null = null;
      const executed = await executeQueuedIntent(async (intent) => {
        if (intent.type === "upvote") {
          const payload = intent.payload as { postId: string };
          replayedPostId = payload.postId;
          return true;
        }
        return false;
      });

      expect(executed).toBe(true);
      expect(replayedPostId).toBe("post-uuid-456");
      expect(hasQueuedIntent()).toBe(false);
      expect(getQueuedIntent()).toBeNull();
    });

    it("captures and replays drafted post creations without losing input", async () => {
      queueCreatePostIntent({
        workspaceSlug: "acme-team",
        boardSlug: "feature-requests",
        title: "Export feedback to CSV",
        description: "Allow workspace admins to export all posts with upvote counts to CSV.",
      });

      expect(hasQueuedIntent()).toBe(true);
      const queued = getQueuedIntent();
      expect(queued?.type).toBe("create_post");

      let createdTitle: string | null = null;
      const success = await executeQueuedIntent(async (intent) => {
        if (intent.type === "create_post") {
          const payload = intent.payload as { title: string };
          createdTitle = payload.title;
          return true;
        }
        return false;
      });

      expect(success).toBe(true);
      expect(createdTitle).toBe("Export feedback to CSV");
      expect(hasQueuedIntent()).toBe(false);
    });
  });
});
