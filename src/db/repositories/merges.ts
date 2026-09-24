import { eq, and, inArray, sql } from "drizzle-orm";
import { posts, postUpvotes, postSubscribers, type Post } from "@/db/schema/posts";
import { comments, type Comment } from "@/db/schema/comments";
import type { DbClient } from "@/db/repositories/workspaces";

export interface MergePostsRecordParams {
  workspaceId: string;
  secondaryPostId: string;
  masterPostId: string;
  authorId: string;
}

export interface MergePostsRecordResult {
  masterPost: Post;
  secondaryPost: Post;
  transferredUpvotesCount: number;
  transferredSubscribersCount: number;
  masterAuditComment: Comment;
  secondaryAuditComment: Comment;
}

/**
 * Executes duplicate post merge inside an atomic database transaction.
 * Transfers unique upvoters and subscribers without constraint violations,
 * increments master upvote count, marks secondary closed with merged pointer,
 * and creates automated system audit trail comments on both posts.
 */
export async function mergePostsTransaction(
  db: DbClient,
  params: MergePostsRecordParams
): Promise<MergePostsRecordResult> {
  return await db.transaction(async (tx) => {
    // 1. Fetch and verify both posts exist within workspace
    const [secondaryPost] = await tx
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.id, params.secondaryPostId),
          eq(posts.workspaceId, params.workspaceId)
        )
      )
      .limit(1);

    const [masterPost] = await tx
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.id, params.masterPostId),
          eq(posts.workspaceId, params.workspaceId)
        )
      )
      .limit(1);

    if (!secondaryPost || !masterPost) {
      throw new Error("One or both posts not found in workspace");
    }

    // 2. Identify upvoters on the secondary post who have not upvoted the master post
    const secondaryUpvotes = await tx
      .select({ userId: postUpvotes.userId })
      .from(postUpvotes)
      .where(eq(postUpvotes.postId, params.secondaryPostId));

    const masterUpvotes = await tx
      .select({ userId: postUpvotes.userId })
      .from(postUpvotes)
      .where(eq(postUpvotes.postId, params.masterPostId));

    const masterUpvoterSet = new Set(masterUpvotes.map((u) => u.userId));
    const uniqueVoterIdsToTransfer = secondaryUpvotes
      .map((u) => u.userId)
      .filter((userId) => !masterUpvoterSet.has(userId));

    // 3. Transfer unique upvoters to master post in post_upvotes without duplicate constraint violations
    if (uniqueVoterIdsToTransfer.length > 0) {
      await tx
        .update(postUpvotes)
        .set({ postId: params.masterPostId })
        .where(
          and(
            eq(postUpvotes.postId, params.secondaryPostId),
            inArray(postUpvotes.userId, uniqueVoterIdsToTransfer)
          )
        );
    }

    // 4. Atomically increment masterPost.upvoteCount by the number of unique transferred voters
    const [updatedMasterPost] = await tx
      .update(posts)
      .set({
        upvoteCount: sql`${posts.upvoteCount} + ${uniqueVoterIdsToTransfer.length}`,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, params.masterPostId))
      .returning();

    // 5. Transfer subscribers from secondary to master if not already subscribed
    const secondarySubscribers = await tx
      .select({ userId: postSubscribers.userId })
      .from(postSubscribers)
      .where(eq(postSubscribers.postId, params.secondaryPostId));

    const masterSubscribers = await tx
      .select({ userId: postSubscribers.userId })
      .from(postSubscribers)
      .where(eq(postSubscribers.postId, params.masterPostId));

    const masterSubscriberSet = new Set(masterSubscribers.map((s) => s.userId));
    const uniqueSubscriberIdsToTransfer = secondarySubscribers
      .map((s) => s.userId)
      .filter((userId) => !masterSubscriberSet.has(userId));

    if (uniqueSubscriberIdsToTransfer.length > 0) {
      await tx
        .update(postSubscribers)
        .set({ postId: params.masterPostId })
        .where(
          and(
            eq(postSubscribers.postId, params.secondaryPostId),
            inArray(postSubscribers.userId, uniqueSubscriberIdsToTransfer)
          )
        );
    }

    // 6. Mark secondary post status = 'closed', mergedIntoPostId = masterPost.id
    const [updatedSecondaryPost] = await tx
      .update(posts)
      .set({
        status: "closed",
        mergedIntoPostId: params.masterPostId,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, params.secondaryPostId))
      .returning();

    // 7. Automatically insert a system audit comment on secondary post: "Merged into [Master Post Title]"
    const [secondaryAuditComment] = await tx
      .insert(comments)
      .values({
        postId: params.secondaryPostId,
        authorId: params.authorId,
        content: `Merged into ${masterPost.title}`,
        isInternalNote: false,
        isSystemAudit: true,
      })
      .returning();

    // 8. Automatically insert a system audit comment on master post: "Merged post [Secondary Post Title] into this request (transferred X upvotes)"
    const [masterAuditComment] = await tx
      .insert(comments)
      .values({
        postId: params.masterPostId,
        authorId: params.authorId,
        content: `Merged post ${secondaryPost.title} into this request (transferred ${uniqueVoterIdsToTransfer.length} upvotes)`,
        isInternalNote: false,
        isSystemAudit: true,
      })
      .returning();

    return {
      masterPost: updatedMasterPost ?? masterPost,
      secondaryPost: updatedSecondaryPost ?? secondaryPost,
      transferredUpvotesCount: uniqueVoterIdsToTransfer.length,
      transferredSubscribersCount: uniqueSubscriberIdsToTransfer.length,
      masterAuditComment,
      secondaryAuditComment,
    };
  });
}
