import {
  togglePostUpvote,
  hasUserUpvotedPost,
  getUserUpvotedPostIds,
  getPostUpvoteCount,
} from "@/db/repositories/upvotes";
import { findPostWithDetailsById, findPostById } from "@/db/repositories/posts";
import { getWorkspaceRecordByIdOrSlug, type DbClient } from "@/db/repositories/workspaces";
import type { Workspace } from "@/db/schema/workspaces";
import { canViewPrivateBoards, type ActorContext } from "@/services/boards";

export type ToggleUpvoteResult =
  | {
      success: true;
      upvoteCount: number;
      hasUpvoted: boolean;
      postId: string;
      workspace: Workspace;
    }
  | {
      success: false;
      error: string;
      code: "UNAUTHENTICATED" | "NOT_FOUND" | "FORBIDDEN" | "VALIDATION_ERROR" | "INTERNAL_ERROR";
    };

export type UpvoteStatusResult =
  | {
      success: true;
      hasUpvoted: boolean;
      upvoteCount: number;
    }
  | {
      success: false;
      error: string;
      code: string;
    };

/**
 * Toggles an upvote on a post with strict tenant isolation, authentication enforcement and board access checks.
 */
export async function toggleUpvote(
  workspaceIdOrSlug: string,
  postId: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<ToggleUpvoteResult> {
  // 1. Authentication check with clear error message for visitors
  if (!actor?.userId || actor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to upvote feedback",
      code: "UNAUTHENTICATED",
    };
  }

  // 2. Validate input parameters
  if (!workspaceIdOrSlug || !workspaceIdOrSlug.trim()) {
    return {
      success: false,
      error: "Workspace identifier is required",
      code: "VALIDATION_ERROR",
    };
  }

  if (!postId || !postId.trim()) {
    return {
      success: false,
      error: "Post ID is required",
      code: "VALIDATION_ERROR",
    };
  }

  // 3. Resolve target workspace
  const workspace = await getWorkspaceRecordByIdOrSlug(db, workspaceIdOrSlug);
  if (!workspace) {
    return {
      success: false,
      error: "Workspace not found",
      code: "NOT_FOUND",
    };
  }

  // 4. Verify post exists in workspace and check board permissions
  const postDetail = await findPostWithDetailsById(db, workspace.id, postId);
  if (!postDetail) {
    return {
      success: false,
      error: "Post not found in workspace",
      code: "NOT_FOUND",
    };
  }

  // 5. Board privacy check
  if (postDetail.board.isPrivate && !canViewPrivateBoards(actor)) {
    return {
      success: false,
      error: "Access denied to private board",
      code: "FORBIDDEN",
    };
  }

  try {
    // 6. Execute atomic repository toggle
    const toggleResult = await togglePostUpvote(db, {
      workspaceId: workspace.id,
      postId,
      userId: actor.userId,
    });

    return {
      success: true,
      upvoteCount: toggleResult.upvoteCount,
      hasUpvoted: toggleResult.hasUpvoted,
      postId,
      workspace,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to toggle upvote",
      code: "INTERNAL_ERROR",
    };
  }
}

/**
 * Retrieves the upvote status and count for a post.
 */
export async function getUpvoteStatus(
  workspaceIdOrSlug: string,
  postId: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<UpvoteStatusResult> {
  const workspace = await getWorkspaceRecordByIdOrSlug(db, workspaceIdOrSlug);
  if (!workspace) {
    return {
      success: false,
      error: "Workspace not found",
      code: "NOT_FOUND",
    };
  }

  const post = await findPostById(db, workspace.id, postId);
  if (!post) {
    return {
      success: false,
      error: "Post not found",
      code: "NOT_FOUND",
    };
  }

  const hasUpvoted = actor?.userId
    ? await hasUserUpvotedPost(db, postId, actor.userId)
    : false;

  return {
    success: true,
    hasUpvoted,
    upvoteCount: post.upvoteCount,
  };
}

export { getUserUpvotedPostIds, getPostUpvoteCount };
