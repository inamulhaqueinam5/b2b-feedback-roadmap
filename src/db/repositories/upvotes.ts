import { eq, and, inArray, sql } from "drizzle-orm";
import { posts, postUpvotes } from "@/db/schema/posts";
import type { DbClient } from "@/db/repositories/workspaces";

export interface ToggleUpvoteParams {
  workspaceId: string;
  postId: string;
  userId: string;
}

export interface ToggleUpvoteResult {
  upvoteCount: number;
  hasUpvoted: boolean;
  postId: string;
}

/**
 * Toggles an upvote for a user on a post within an atomic database transaction.
 * If the user has already upvoted, deletes the upvote record and decrements the post upvoteCount.
 * If the user has not upvoted, creates an upvote record and increments the post upvoteCount.
 * Strictly guarantees that upvoteCount never drops below zero.
 */
export async function togglePostUpvote(
  db: DbClient,
  params: ToggleUpvoteParams
): Promise<ToggleUpvoteResult> {
  return await db.transaction(async (tx) => {
    // 1. Verify post exists in the target workspace
    const [targetPost] = await tx
      .select({ id: posts.id, upvoteCount: posts.upvoteCount })
      .from(posts)
      .where(and(eq(posts.id, params.postId), eq(posts.workspaceId, params.workspaceId)))
      .limit(1);

    if (!targetPost) {
      throw new Error("Post not found in workspace");
    }

    // 2. Check if user already upvoted this post
    const [existingUpvote] = await tx
      .select({ id: postUpvotes.id })
      .from(postUpvotes)
      .where(
        and(
          eq(postUpvotes.postId, params.postId),
          eq(postUpvotes.userId, params.userId)
        )
      )
      .limit(1);

    if (existingUpvote) {
      // User already upvoted: delete from post_upvotes
      await tx
        .delete(postUpvotes)
        .where(
          and(
            eq(postUpvotes.postId, params.postId),
            eq(postUpvotes.userId, params.userId)
          )
        );

      // Decrement upvoteCount atomically, never below 0
      const [updatedPost] = await tx
        .update(posts)
        .set({
          upvoteCount: sql`GREATEST(${posts.upvoteCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(posts.id, params.postId),
            eq(posts.workspaceId, params.workspaceId)
          )
        )
        .returning({ upvoteCount: posts.upvoteCount });

      return {
        upvoteCount: updatedPost ? updatedPost.upvoteCount : Math.max(targetPost.upvoteCount - 1, 0),
        hasUpvoted: false,
        postId: params.postId,
      };
    } else {
      // User has not upvoted: insert into post_upvotes
      await tx.insert(postUpvotes).values({
        postId: params.postId,
        userId: params.userId,
      });

      // Increment upvoteCount atomically
      const [updatedPost] = await tx
        .update(posts)
        .set({
          upvoteCount: sql`${posts.upvoteCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(posts.id, params.postId),
            eq(posts.workspaceId, params.workspaceId)
          )
        )
        .returning({ upvoteCount: posts.upvoteCount });

      return {
        upvoteCount: updatedPost ? updatedPost.upvoteCount : targetPost.upvoteCount + 1,
        hasUpvoted: true,
        postId: params.postId,
      };
    }
  });
}

/**
 * Checks whether a specific user has upvoted a post.
 */
export async function hasUserUpvotedPost(
  db: DbClient,
  postId: string,
  userId: string
): Promise<boolean> {
  const [found] = await db
    .select({ id: postUpvotes.id })
    .from(postUpvotes)
    .where(and(eq(postUpvotes.postId, postId), eq(postUpvotes.userId, userId)))
    .limit(1);

  return !!found;
}

/**
 * Fetches the set of post IDs from a given list that the user has upvoted.
 * Scoped to the provided list of post IDs and userId.
 */
export async function getUserUpvotedPostIds(
  db: DbClient,
  postIds: string[],
  userId: string
): Promise<Set<string>> {
  if (postIds.length === 0 || !userId) {
    return new Set<string>();
  }

  const rows = await db
    .select({ postId: postUpvotes.postId })
    .from(postUpvotes)
    .where(and(inArray(postUpvotes.postId, postIds), eq(postUpvotes.userId, userId)));

  return new Set<string>(rows.map((r) => r.postId));
}

/**
 * Retrieves the current upvote count for a post.
 */
export async function getPostUpvoteCount(
  db: DbClient,
  postId: string
): Promise<number | null> {
  const [post] = await db
    .select({ upvoteCount: posts.upvoteCount })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  return post ? post.upvoteCount : null;
}
