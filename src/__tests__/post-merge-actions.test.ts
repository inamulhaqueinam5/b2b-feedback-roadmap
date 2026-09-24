import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import { createPost } from "@/services/posts";
import { mergePostsAction } from "@/actions/merges";
import { mergePosts, canMergePosts } from "@/services/merges";
import { findPostById, hasUserUpvotedPost, isUserSubscribedToPost } from "@/db/repositories/posts";
import { postUpvotes, postSubscribers, posts } from "@/db/schema/posts";
import { findCommentsByPostId } from "@/db/repositories/comments";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";
import type { ActorContext } from "@/services/boards";

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

describe("Duplicate Post Merging Engine & Server Actions", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let otherWorkspace: Workspace;
  let board: Board;
  let otherBoard: Board;

  let ownerUser: User;
  let adminUser: User;
  let memberUser: User;
  let guestUser: User;
  let visitorUser: User;
  let voter1User: User;
  let voter2User: User;
  let voter3User: User;
  let voter4User: User;

  let ownerActor: ActorContext;
  let adminActor: ActorContext;
  let memberActor: ActorContext;
  let guestActor: ActorContext;
  let visitorActor: ActorContext;
  let voter1Actor: ActorContext;
  let voter2Actor: ActorContext;

  beforeAll(async () => {
    db = await getTestDb();

    workspace = await createWorkspaceRecord(db, {
      name: "Acme Product Feedback",
      slug: "acme-feedback-engine",
    });

    otherWorkspace = await createWorkspaceRecord(db, {
      name: "Different Tenant Workspace",
      slug: "different-tenant-engine",
    });

    board = await createBoardRecord(db, workspace.id, {
      name: "Feature Requests",
      slug: "feature-requests",
      isPrivate: false,
    });

    otherBoard = await createBoardRecord(db, otherWorkspace.id, {
      name: "Other Tenant Board",
      slug: "other-tenant-board",
      isPrivate: false,
    });

    ownerUser = await createUserRecord(db, {
      email: "owner-merge@example.com",
      name: "Owen Owner",
    });

    adminUser = await createUserRecord(db, {
      email: "admin-merge@example.com",
      name: "Alice Admin",
    });

    memberUser = await createUserRecord(db, {
      email: "member-merge@example.com",
      name: "Mark Member",
    });

    guestUser = await createUserRecord(db, {
      email: "guest-merge@example.com",
      name: "Gary Guest",
    });

    visitorUser = await createUserRecord(db, {
      email: "visitor-merge@example.com",
      name: "Victor Visitor",
    });

    voter1User = await createUserRecord(db, {
      email: "voter1-merge@example.com",
      name: "Vera Voter1",
    });

    voter2User = await createUserRecord(db, {
      email: "voter2-merge@example.com",
      name: "Vance Voter2",
    });

    voter3User = await createUserRecord(db, {
      email: "voter3-merge@example.com",
      name: "Valerie Voter3",
    });

    voter4User = await createUserRecord(db, {
      email: "voter4-merge@example.com",
      name: "Victor Voter4",
    });

    ownerActor = {
      userId: ownerUser.id,
      role: "owner",
      user: ownerUser,
    };

    adminActor = {
      userId: adminUser.id,
      role: "admin",
      user: adminUser,
    };

    memberActor = {
      userId: memberUser.id,
      role: "member",
      user: memberUser,
    };

    guestActor = {
      userId: guestUser.id,
      role: "guest",
      user: guestUser,
    };

    visitorActor = {
      role: "visitor",
    };

    voter1Actor = {
      userId: voter1User.id,
      role: "member",
      user: voter1User,
    };

    voter2Actor = {
      userId: voter2User.id,
      role: "member",
      user: voter2User,
    };
  });

  beforeEach(() => {
    revalidatePathMock.mockClear();
    revalidateTagMock.mockClear();
  });

  describe("Unique Upvoter Transfer Without Duplicates", () => {
    it("transfers unique upvoters from secondary to master without duplicate constraint violations", async () => {
      // 1. Create master post authored by voter1 (initial upvote from voter1)
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "SAML and SSO Enterprise Authentication Support",
          description: "Enable Okta and Azure AD enterprise SSO login support.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      expect(masterRes.success).toBe(true);
      if (!masterRes.success) return;
      const masterPostId = masterRes.post.id;
      expect(masterRes.post.upvoteCount).toBe(1);

      // 2. Create secondary post authored by voter2 (initial upvote from voter2)
      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "Okta SSO Integration Duplicate",
          description: "We need Okta single sign-on for our corporate team.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      expect(secondaryRes.success).toBe(true);
      if (!secondaryRes.success) return;
      const secondaryPostId = secondaryRes.post.id;
      expect(secondaryRes.post.upvoteCount).toBe(1);

      // 3. Add extra upvotes on secondary post: voter3 and voter4
      await db.insert(postUpvotes).values([
        { postId: secondaryPostId, userId: voter3User.id },
        { postId: secondaryPostId, userId: voter4User.id },
      ]);
      await db
        .update(posts)
        .set({ upvoteCount: 3 })
        .where(eq(posts.id, secondaryPostId));

      // 4. Add voter1 (already on master post) as an upvoter on secondary post as well
      await db.insert(postUpvotes).values({
        postId: secondaryPostId,
        userId: voter1User.id,
      });

      // Secondary now has upvotes from [voter2, voter3, voter4, voter1]
      // Master has upvote from [voter1]
      // Unique voters to transfer are [voter2, voter3, voter4] (3 voters)
      const mergeRes = await mergePostsAction(
        workspace.id,
        secondaryPostId,
        masterPostId,
        adminActor,
        db
      );

      expect(mergeRes.success).toBe(true);
      if (!mergeRes.success) return;

      expect(mergeRes.transferredUpvotesCount).toBe(3);

      // Verify master post has all 4 voters in post_upvotes
      const masterVotes = await db
        .select()
        .from(postUpvotes)
        .where(eq(postUpvotes.postId, masterPostId));

      const masterVoterIds = masterVotes.map((v) => v.userId);
      expect(masterVotes.length).toBe(4);
      expect(masterVoterIds).toContain(voter1User.id);
      expect(masterVoterIds).toContain(voter2User.id);
      expect(masterVoterIds).toContain(voter3User.id);
      expect(masterVoterIds).toContain(voter4User.id);

      // Verify helper checks
      expect(await hasUserUpvotedPost(db, masterPostId, voter1User.id)).toBe(true);
      expect(await hasUserUpvotedPost(db, masterPostId, voter2User.id)).toBe(true);
      expect(await hasUserUpvotedPost(db, masterPostId, voter3User.id)).toBe(true);
      expect(await hasUserUpvotedPost(db, masterPostId, voter4User.id)).toBe(true);
    });

    it("handles zero transferable upvotes gracefully when all secondary voters already upvoted master", async () => {
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "Dark Mode Theme Support",
          description: "Provide dark mode across all views.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!masterRes.success) return;

      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "Dark Theme Request Duplicate",
          description: "Add dark theme support please.",
          boardSlug: board.slug,
        },
        voter1Actor, // Same author, so voter1 is on both
        db
      );
      if (!secondaryRes.success) return;

      const mergeRes = await mergePostsAction(
        workspace.id,
        secondaryRes.post.id,
        masterRes.post.id,
        adminActor,
        db
      );

      expect(mergeRes.success).toBe(true);
      if (!mergeRes.success) return;

      expect(mergeRes.transferredUpvotesCount).toBe(0);

      const refreshedMaster = await findPostById(db, workspace.id, masterRes.post.id);
      expect(refreshedMaster?.upvoteCount).toBe(1);
    });
  });

  describe("Master Post Upvote Count Accuracy", () => {
    it("atomically increments master post upvote_count strictly by the number of unique transferred voters", async () => {
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "Export Feedback Data to CSV and JSON",
          description: "Ability to export all board data in CSV and JSON formats.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!masterRes.success) return;

      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "CSV Export Duplicate Request",
          description: "Export data to Excel or CSV.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      if (!secondaryRes.success) return;

      // Add voter3 to secondary
      await db.insert(postUpvotes).values({
        postId: secondaryRes.post.id,
        userId: voter3User.id,
      });

      // Master initial count is 1. Secondary has voter2 and voter3 (both new to master).
      const mergeRes = await mergePostsAction(
        workspace.id,
        secondaryRes.post.id,
        masterRes.post.id,
        adminActor,
        db
      );

      expect(mergeRes.success).toBe(true);
      if (!mergeRes.success) return;

      expect(mergeRes.transferredUpvotesCount).toBe(2);

      const refreshedMaster = await findPostById(db, workspace.id, masterRes.post.id);
      expect(refreshedMaster?.upvoteCount).toBe(3);
    });
  });

  describe("Secondary Post Status, Redirect Pointer and Audit Comments", () => {
    it("marks secondary post closed, sets mergedIntoPostId pointer and creates system audit comments", async () => {
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "Custom Domain CNAME Configuration",
          description: "Allow custom domain mapping for public roadmap.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!masterRes.success) return;

      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "White Label Custom Domains",
          description: "Use our own domain for feedback boards.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      if (!secondaryRes.success) return;

      const mergeRes = await mergePostsAction(
        workspace.id,
        secondaryRes.post.id,
        masterRes.post.id,
        adminActor,
        db
      );

      expect(mergeRes.success).toBe(true);
      if (!mergeRes.success) return;

      // Verify secondary post closed state and pointer
      const refreshedSecondary = await findPostById(db, workspace.id, secondaryRes.post.id);
      expect(refreshedSecondary).not.toBeNull();
      expect(refreshedSecondary?.status).toBe("closed");
      expect(refreshedSecondary?.mergedIntoPostId).toBe(masterRes.post.id);

      // Verify system audit comment on secondary post
      const secondaryComments = await findCommentsByPostId(db, secondaryRes.post.id);
      const secondaryAudit = secondaryComments.find((c) => c.isSystemAudit);
      expect(secondaryAudit).toBeDefined();
      expect(secondaryAudit?.content).toBe(
        `Merged into ${masterRes.post.title}`
      );
      expect(secondaryAudit?.isInternalNote).toBe(false);

      // Verify system audit comment on master post
      const masterComments = await findCommentsByPostId(db, masterRes.post.id);
      const masterAudit = masterComments.find((c) => c.isSystemAudit);
      expect(masterAudit).toBeDefined();
      expect(masterAudit?.content).toBe(
        `Merged post ${secondaryRes.post.title} into this request (transferred 1 upvotes)`
      );
      expect(masterAudit?.isInternalNote).toBe(false);
    });

    it("transfers subscribers from secondary post to master post without duplicate errors", async () => {
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "Slack Notification Webhooks",
          description: "Send updates into Slack channels.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!masterRes.success) return;

      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "Slack Bot Integration",
          description: "Integrate with Slack bot notifications.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      if (!secondaryRes.success) return;

      // voter2 created secondary, so voter2 is already subscribed to secondary
      // Add voter3 as subscriber to secondary post
      await db.insert(postSubscribers).values({
        postId: secondaryRes.post.id,
        userId: voter3User.id,
      });

      // Add voter1 (master author) as subscriber to secondary post as well
      await db.insert(postSubscribers).values({
        postId: secondaryRes.post.id,
        userId: voter1User.id,
      });

      const mergeRes = await mergePostsAction(
        workspace.id,
        secondaryRes.post.id,
        masterRes.post.id,
        adminActor,
        db
      );

      expect(mergeRes.success).toBe(true);
      if (!mergeRes.success) return;

      expect(mergeRes.transferredSubscribersCount).toBe(2); // voter2 and voter3 transferred

      expect(await isUserSubscribedToPost(db, masterRes.post.id, voter1User.id)).toBe(true);
      expect(await isUserSubscribedToPost(db, masterRes.post.id, voter2User.id)).toBe(true);
      expect(await isUserSubscribedToPost(db, masterRes.post.id, voter3User.id)).toBe(true);
    });
  });

  describe("RBAC Protection and Non-Admin Rejection", () => {
    let testMasterId: string;
    let testSecondaryId: string;

    beforeAll(async () => {
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "Zapier Automation Triggers",
          description: "Trigger zaps when feedback changes status.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (masterRes.success) {
        testMasterId = masterRes.post.id;
      }

      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "Zapier Integration Support",
          description: "Add Zapier integration.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      if (secondaryRes.success) {
        testSecondaryId = secondaryRes.post.id;
      }
    });

    it("rejects workspace members with FORBIDDEN", async () => {
      const result = await mergePostsAction(
        workspace.id,
        testSecondaryId,
        testMasterId,
        memberActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("FORBIDDEN");
        expect(result.error).toContain("Only workspace owners and admins");
      }
    });

    it("rejects guest users with FORBIDDEN", async () => {
      const result = await mergePostsAction(
        workspace.id,
        testSecondaryId,
        testMasterId,
        guestActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("FORBIDDEN");
        expect(result.error).toContain("Only workspace owners and admins");
      }
    });

    it("rejects unauthenticated visitors with UNAUTHENTICATED", async () => {
      const result = await mergePostsAction(
        workspace.id,
        testSecondaryId,
        testMasterId,
        visitorActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNAUTHENTICATED");
      }
    });

    it("allows workspace owners to merge posts", async () => {
      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "Owner Merge Target Duplicate",
          description: "Duplicate post to be merged by owner.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!secondaryRes.success) return;

      const result = await mergePostsAction(
        workspace.id,
        secondaryRes.post.id,
        testMasterId,
        ownerActor,
        db
      );

      expect(result.success).toBe(true);
    });

    it("verifies canMergePosts helper logic", () => {
      expect(canMergePosts(ownerActor)).toBe(true);
      expect(canMergePosts(adminActor)).toBe(true);
      expect(canMergePosts(memberActor)).toBe(false);
      expect(canMergePosts(guestActor)).toBe(false);
      expect(canMergePosts(visitorActor)).toBe(false);
      expect(canMergePosts(undefined)).toBe(false);
    });
  });

  describe("Cross-Tenant Merge Rejection", () => {
    it("rejects cross-tenant merge when secondary post belongs to a different workspace", async () => {
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "Tenant A Roadmap Post",
          description: "Post in Acme workspace.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!masterRes.success) return;

      const otherTenantPost = await createPost(
        otherWorkspace.slug,
        {
          title: "Tenant B Duplicate Post",
          description: "Post in Competitor workspace.",
          boardSlug: otherBoard.slug,
        },
        voter2Actor,
        db
      );
      if (!otherTenantPost.success) return;

      const result = await mergePostsAction(
        workspace.id,
        otherTenantPost.post.id,
        masterRes.post.id,
        adminActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("FORBIDDEN");
        expect(result.error).toContain("Cross-tenant");
      }
    });

    it("rejects cross-tenant merge when master post belongs to a different workspace", async () => {
      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "Tenant A Duplicate Post",
          description: "Post in Acme workspace.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!secondaryRes.success) return;

      const otherTenantMaster = await createPost(
        otherWorkspace.slug,
        {
          title: "Tenant B Master Post",
          description: "Master post in Competitor workspace.",
          boardSlug: otherBoard.slug,
        },
        voter2Actor,
        db
      );
      if (!otherTenantMaster.success) return;

      const result = await mergePostsAction(
        workspace.id,
        secondaryRes.post.id,
        otherTenantMaster.post.id,
        adminActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("FORBIDDEN");
        expect(result.error).toContain("Cross-tenant");
      }
    });
  });

  describe("Circular Merges, Invalid Target and Edge Cases", () => {
    it("rejects merging a post into itself", async () => {
      const postRes = await createPost(
        workspace.slug,
        {
          title: "Self Merge Post Target",
          description: "Testing self merge prevention.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!postRes.success) return;

      const result = await mergePostsAction(
        workspace.id,
        postRes.post.id,
        postRes.post.id,
        adminActor,
        db
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("CIRCULAR_MERGE");
        expect(result.error).toContain("itself");
      }
    });

    it("rejects merging into a master post that is already merged", async () => {
      const post1 = await createPost(
        workspace.slug,
        {
          title: "Canonical Master Alpha",
          description: "The primary canonical post.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!post1.success) return;

      const post2 = await createPost(
        workspace.slug,
        {
          title: "Subordinate Post Beta",
          description: "Subordinate post to be merged into alpha.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      if (!post2.success) return;

      const post3 = await createPost(
        workspace.slug,
        {
          title: "Another Post Gamma",
          description: "Attempting to merge into already merged beta.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!post3.success) return;

      // Merge post2 into post1
      const mergeBeta = await mergePostsAction(
        workspace.id,
        post2.post.id,
        post1.post.id,
        adminActor,
        db
      );
      expect(mergeBeta.success).toBe(true);

      // Now attempt to merge post3 into post2 (which is already merged into post1)
      const mergeGamma = await mergePostsAction(
        workspace.id,
        post3.post.id,
        post2.post.id,
        adminActor,
        db
      );

      expect(mergeGamma.success).toBe(false);
      if (!mergeGamma.success) {
        expect(mergeGamma.code).toBe("CIRCULAR_MERGE");
        expect(mergeGamma.error).toContain("already been merged");
      }
    });

    it("rejects merging a secondary post that has already been merged", async () => {
      const postA = await createPost(
        workspace.slug,
        {
          title: "Canonical Target One",
          description: "First canonical post.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!postA.success) return;

      const postB = await createPost(
        workspace.slug,
        {
          title: "Canonical Target Two",
          description: "Second canonical post.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      if (!postB.success) return;

      const duplicate = await createPost(
        workspace.slug,
        {
          title: "Duplicate To Merge Once",
          description: "Testing double merge prevention.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!duplicate.success) return;

      // Merge duplicate into postA
      const firstMerge = await mergePostsAction(
        workspace.id,
        duplicate.post.id,
        postA.post.id,
        adminActor,
        db
      );
      expect(firstMerge.success).toBe(true);

      // Attempt to merge duplicate again into postB
      const secondMerge = await mergePostsAction(
        workspace.id,
        duplicate.post.id,
        postB.post.id,
        adminActor,
        db
      );

      expect(secondMerge.success).toBe(false);
      if (!secondMerge.success) {
        expect(secondMerge.code).toBe("ALREADY_MERGED");
        expect(secondMerge.error).toContain("already been merged");
      }
    });

    it("returns NOT_FOUND for non-existent post IDs", async () => {
      const post = await createPost(
        workspace.slug,
        {
          title: "Existing Post Test",
          description: "Testing non-existent IDs.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!post.success) return;

      const fakeId = "00000000-0000-0000-0000-000000000000";

      const result1 = await mergePostsAction(
        workspace.id,
        fakeId,
        post.post.id,
        adminActor,
        db
      );
      expect(result1.success).toBe(false);
      if (!result1.success) {
        expect(result1.code).toBe("NOT_FOUND");
      }

      const result2 = await mergePostsAction(
        workspace.id,
        post.post.id,
        fakeId,
        adminActor,
        db
      );
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.code).toBe("NOT_FOUND");
      }
    });

    it("accepts workspace slug in place of workspace UUID", async () => {
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "Slug Resolution Master",
          description: "Testing workspace slug resolution.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!masterRes.success) return;

      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "Slug Resolution Secondary",
          description: "Testing workspace slug resolution.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      if (!secondaryRes.success) return;

      // Pass workspace.slug instead of workspace.id
      const result = await mergePostsAction(
        workspace.slug,
        secondaryRes.post.id,
        masterRes.post.id,
        adminActor,
        db
      );

      expect(result.success).toBe(true);
    });

    it("triggers cache revalidation for workspace paths and tags", async () => {
      const masterRes = await createPost(
        workspace.slug,
        {
          title: "Cache Revalidation Master",
          description: "Testing cache tag purge.",
          boardSlug: board.slug,
        },
        voter1Actor,
        db
      );
      if (!masterRes.success) return;

      const secondaryRes = await createPost(
        workspace.slug,
        {
          title: "Cache Revalidation Secondary",
          description: "Testing cache tag purge.",
          boardSlug: board.slug,
        },
        voter2Actor,
        db
      );
      if (!secondaryRes.success) return;

      revalidatePathMock.mockClear();
      revalidateTagMock.mockClear();

      const result = await mergePostsAction(
        workspace.id,
        secondaryRes.post.id,
        masterRes.post.id,
        adminActor,
        db
      );

      expect(result.success).toBe(true);

      expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${workspace.slug}`);
      expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${workspace.slug}/p/${secondaryRes.post.id}`);
      expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${workspace.slug}/p/${masterRes.post.id}`);
      expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${workspace.slug}/roadmap`);

      expect(revalidateTagMock).toHaveBeenCalledWith(`post:${secondaryRes.post.id}`);
      expect(revalidateTagMock).toHaveBeenCalledWith(`post:${masterRes.post.id}`);
      expect(revalidateTagMock).toHaveBeenCalledWith(`workspace:${workspace.id}:roadmap`);
    });
  });
});
