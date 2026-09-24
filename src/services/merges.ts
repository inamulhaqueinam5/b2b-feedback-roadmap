import {
  mergePostsTransaction,
  type MergePostsRecordResult,
} from "@/db/repositories/merges";
import { findPostById } from "@/db/repositories/posts";
import { getBoardRecordById } from "@/db/repositories/boards";
import {
  getWorkspaceRecordById,
  getWorkspaceRecordBySlug,
  type DbClient,
} from "@/db/repositories/workspaces";
import type { Post } from "@/db/schema/posts";
import type { Board } from "@/db/schema/boards";
import type { Workspace } from "@/db/schema/workspaces";
import type { Comment } from "@/db/schema/comments";
import type { ActorContext } from "@/services/boards";

export interface MergePostsParams {
  workspaceIdOrSlug: string;
  secondaryPostId: string;
  masterPostId: string;
}

export type MergePostsResult =
  | {
      success: true;
      masterPost: Post;
      secondaryPost: Post;
      masterBoard: Board | null;
      secondaryBoard: Board | null;
      workspace: Workspace;
      transferredUpvotesCount: number;
      transferredSubscribersCount: number;
      masterAuditComment: Comment;
      secondaryAuditComment: Comment;
    }
  | {
      success: false;
      error: string;
      code:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "VALIDATION_ERROR"
        | "NOT_FOUND"
        | "CIRCULAR_MERGE"
        | "ALREADY_MERGED"
        | "INTERNAL_ERROR";
    };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveWorkspace(
  workspaceIdOrSlug: string,
  db: DbClient
): Promise<Workspace | null> {
  if (!workspaceIdOrSlug) return null;
  const trimmed = workspaceIdOrSlug.trim();
  if (UUID_REGEX.test(trimmed)) {
    const ws = await getWorkspaceRecordById(db, trimmed);
    if (ws) return ws;
  }
  return await getWorkspaceRecordBySlug(db, trimmed.toLowerCase());
}

/**
 * Checks whether the given actor has permissions to merge duplicate posts.
 * Only workspace owners and admins can perform merges.
 */
export function canMergePosts(actor?: ActorContext): boolean {
  if (!actor?.userId) return false;
  return actor.role === "owner" || actor.role === "admin";
}

/**
 * Merges a secondary duplicate post into a master canonical post within an atomic transaction.
 * Enforces owner/admin RBAC, strict tenant isolation and circular merge prevention.
 */
export async function mergePosts(
  workspaceIdOrSlug: string,
  secondaryPostId: string,
  masterPostId: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<MergePostsResult> {
  // 1. RBAC check: only workspace owners and admins can merge posts
  if (!actor?.userId || actor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to merge feedback posts",
      code: "UNAUTHENTICATED",
    };
  }

  if (actor.role !== "owner" && actor.role !== "admin") {
    return {
      success: false,
      error: "Only workspace owners and admins can merge posts",
      code: "FORBIDDEN",
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

  const cleanSecondaryId = secondaryPostId?.trim();
  const cleanMasterId = masterPostId?.trim();

  if (!cleanSecondaryId || !cleanMasterId) {
    return {
      success: false,
      error: "Both secondary post ID and master post ID are required",
      code: "VALIDATION_ERROR",
    };
  }

  // 3. Prevent merging a post into itself
  if (cleanSecondaryId === cleanMasterId) {
    return {
      success: false,
      error: "Cannot merge a post into itself",
      code: "CIRCULAR_MERGE",
    };
  }

  // 4. Resolve target workspace
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) {
    return {
      success: false,
      error: "Workspace not found",
      code: "NOT_FOUND",
    };
  }

  // 5. Look up both posts
  const secondaryPost = await findPostById(db, cleanSecondaryId);
  if (!secondaryPost) {
    return {
      success: false,
      error: "Secondary post not found",
      code: "NOT_FOUND",
    };
  }

  const masterPost = await findPostById(db, cleanMasterId);
  if (!masterPost) {
    return {
      success: false,
      error: "Master post not found",
      code: "NOT_FOUND",
    };
  }

  // 6. Tenant isolation: both posts must belong to the resolved workspace
  if (
    secondaryPost.workspaceId !== workspace.id ||
    masterPost.workspaceId !== workspace.id ||
    secondaryPost.workspaceId !== masterPost.workspaceId
  ) {
    return {
      success: false,
      error: "Cross-tenant merge is rejected. Both posts must belong to the same workspace.",
      code: "FORBIDDEN",
    };
  }

  // 7. Prevent merging an already merged post
  if (secondaryPost.mergedIntoPostId) {
    return {
      success: false,
      error: "Secondary post has already been merged into another request",
      code: "ALREADY_MERGED",
    };
  }

  // 8. Prevent circular merge: master post cannot already be merged
  if (masterPost.mergedIntoPostId) {
    return {
      success: false,
      error: "Cannot merge into a target post that has already been merged",
      code: "CIRCULAR_MERGE",
    };
  }

  try {
    // 9. Execute atomic repository transaction
    const txResult: MergePostsRecordResult = await mergePostsTransaction(db, {
      workspaceId: workspace.id,
      secondaryPostId: secondaryPost.id,
      masterPostId: masterPost.id,
      authorId: actor.userId,
    });

    const masterBoard = await getBoardRecordById(db, workspace.id, txResult.masterPost.boardId);
    const secondaryBoard = await getBoardRecordById(db, workspace.id, txResult.secondaryPost.boardId);

    return {
      success: true,
      masterPost: txResult.masterPost,
      secondaryPost: txResult.secondaryPost,
      masterBoard,
      secondaryBoard,
      workspace,
      transferredUpvotesCount: txResult.transferredUpvotesCount,
      transferredSubscribersCount: txResult.transferredSubscribersCount,
      masterAuditComment: txResult.masterAuditComment,
      secondaryAuditComment: txResult.secondaryAuditComment,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to execute post merge transaction",
      code: "INTERNAL_ERROR",
    };
  }
}
