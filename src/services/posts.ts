import {
  createPostSchema,
  searchDuplicatesSchema,
  type CreatePostInput,
} from "@/lib/validation/post";
import {
  createPostWithInitialUpvote,
  searchSimilarPosts,
  findPostById,
  findPostWithDetailsById,
  hasUserUpvotedPost,
  isUserSubscribedToPost,
  findPostsByBoard,
  updatePostStatusWithAudit,
  POST_STATUS_LABELS,
  formatStatusLabel,
  type SimilarPost,
} from "@/db/repositories/posts";
import {
  getBoardRecordById,
  getBoardRecordBySlug,
} from "@/db/repositories/boards";
import {
  getWorkspaceRecordById,
  getWorkspaceRecordBySlug,
  type DbClient,
} from "@/db/repositories/workspaces";
import { postStatusEnum, type Post, type PostStatus } from "@/db/schema/posts";
import type { Board } from "@/db/schema/boards";
import type { Workspace } from "@/db/schema/workspaces";
import type { Comment } from "@/db/schema/comments";
import { canViewPrivateBoards, type ActorContext } from "@/services/boards";

export type CreatePostResult =
  | {
      success: true;
      post: Post;
      board: Board;
      workspace: Workspace;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export type SearchDuplicatesResult =
  | {
      success: true;
      posts: SimilarPost[];
    }
  | {
      success: false;
      error: string;
    };

export type GetPostDetailResult =
  | {
      success: true;
      post: Post;
      board: { id: string; name: string; slug: string; isPrivate: boolean };
      workspace: Workspace;
      author: { id: string; name: string | null; image: string | null; email: string };
      hasUpvoted: boolean;
      isSubscribed: boolean;
      mergedIntoPost?: { id: string; title: string } | null;
    }
  | {
      success: false;
      error: string;
    };

export type GetPostsForBoardResult =
  | {
      success: true;
      posts: Post[];
      board: Board;
      workspace: Workspace;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Creates a post with automatic author upvote and subscription registration.
 * Enforces authentication and board privacy permissions.
 */
export async function createPost(
  workspaceSlug: string,
  rawInput: unknown,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<CreatePostResult> {
  if (!actor?.userId || actor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to submit feedback",
      code: "UNAUTHENTICATED",
    };
  }

  const parsed = createPostSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join("; ");
    return { success: false, error: errorMsg, code: "VALIDATION_ERROR" };
  }

  const input: CreatePostInput = parsed.data;
  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);

  if (!workspace) {
    return { success: false, error: "Workspace not found", code: "NOT_FOUND" };
  }

  let board: Board | null = null;
  if (input.boardId) {
    board = await getBoardRecordById(db, workspace.id, input.boardId);
  } else if (input.boardSlug) {
    board = await getBoardRecordBySlug(db, workspace.id, input.boardSlug.trim().toLowerCase());
  }

  if (!board || board.isArchived) {
    return { success: false, error: "Target board not found or archived", code: "NOT_FOUND" };
  }

  if (board.isPrivate && !canViewPrivateBoards(actor)) {
    return {
      success: false,
      error: "Access denied to private board",
      code: "FORBIDDEN",
    };
  }

  const post = await createPostWithInitialUpvote(db, {
    workspaceId: workspace.id,
    boardId: board.id,
    authorId: actor.userId,
    title: input.title,
    description: input.description,
    status: "open",
    upvoteCount: 1,
  });

  return {
    success: true,
    post,
    board,
    workspace,
  };
}

/**
 * Searches similar posts within workspace for duplicate detection.
 * Accessible to authenticated users and visitors.
 */
export async function searchDuplicates(
  workspaceSlug: string,
  rawQuery: string,
  options: { boardId?: string; limit?: number } | undefined,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<SearchDuplicatesResult> {
  const query = rawQuery?.trim() ?? "";
  if (query.length < 2) {
    return { success: true, posts: [] };
  }

  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);

  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const posts = await searchSimilarPosts(db, {
    workspaceId: workspace.id,
    query,
    boardId: options?.boardId,
    limit: options?.limit ?? 5,
  });

  return {
    success: true,
    posts,
  };
}

/**
 * Fetches post details including author, board and interaction states.
 */
export async function getPostDetail(
  workspaceSlug: string,
  postId: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<GetPostDetailResult> {
  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);

  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const postDetail = await findPostWithDetailsById(db, workspace.id, postId);
  if (!postDetail) {
    return { success: false, error: "Post not found" };
  }

  if (postDetail.board.isPrivate && !canViewPrivateBoards(actor)) {
    return { success: false, error: "Post not found" };
  }

  let hasUpvoted = false;
  let isSubscribed = false;

  if (actor?.userId) {
    hasUpvoted = await hasUserUpvotedPost(db, postId, actor.userId);
    isSubscribed = await isUserSubscribedToPost(db, postId, actor.userId);
  }

  let mergedIntoPost: { id: string; title: string } | null = null;
  if (postDetail.post.mergedIntoPostId) {
    const master = await findPostById(db, workspace.id, postDetail.post.mergedIntoPostId);
    if (master) {
      mergedIntoPost = { id: master.id, title: master.title };
    }
  }

  return {
    success: true,
    post: postDetail.post,
    board: postDetail.board,
    workspace,
    author: postDetail.author,
    hasUpvoted,
    isSubscribed,
    mergedIntoPost,
  };
}

/**
 * Lists posts for a board with status filtering and sorting.
 */
export async function getPostsForBoard(
  workspaceSlug: string,
  boardSlug: string,
  options:
    | {
        status?: PostStatus;
        sortBy?: "newest" | "top" | "trending";
        limit?: number;
        offset?: number;
      }
    | undefined,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<GetPostsForBoardResult> {
  const cleanWorkspaceSlug = workspaceSlug.trim().toLowerCase();
  const workspace = await getWorkspaceRecordBySlug(db, cleanWorkspaceSlug);

  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  const board = await getBoardRecordBySlug(db, workspace.id, boardSlug.trim().toLowerCase());
  if (!board || board.isArchived) {
    return { success: false, error: "Board not found" };
  }

  if (board.isPrivate && !canViewPrivateBoards(actor)) {
    return { success: false, error: "Board not found" };
  }

  const posts = await findPostsByBoard(db, workspace.id, board.id, options);

  return {
    success: true,
    posts,
    board,
    workspace,
  };
}

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

export function canModeratePosts(actor?: ActorContext): boolean {
  if (!actor?.userId) return false;
  return actor.role === "owner" || actor.role === "admin";
}

export type UpdatePostStatusResult =
  | {
      success: true;
      post: Post;
      board: Board;
      workspace: Workspace;
      auditComment: Comment;
      previousStatus: PostStatus;
      newStatus: PostStatus;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

/**
 * Transitions a post status and creates an automated system audit trail record.
 * Restricted strictly to workspace owners and admins.
 */
export async function updatePostStatus(
  workspaceIdOrSlug: string,
  postId: string,
  newStatus: PostStatus,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<UpdatePostStatusResult> {
  if (!actor?.userId || (actor.role !== "owner" && actor.role !== "admin")) {
    return {
      success: false,
      error: "Only workspace owners and admins can transition post status",
      code: "FORBIDDEN",
    };
  }

  if (!newStatus || !postStatusEnum.includes(newStatus as PostStatus)) {
    return {
      success: false,
      error: `Invalid post status: ${String(newStatus)}`,
      code: "VALIDATION_ERROR",
    };
  }

  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) {
    return {
      success: false,
      error: "Workspace not found",
      code: "NOT_FOUND",
    };
  }

  const updateResult = await updatePostStatusWithAudit(db, {
    workspaceId: workspace.id,
    postId,
    newStatus,
    authorId: actor.userId,
  });

  if (!updateResult) {
    return {
      success: false,
      error: "Post not found",
      code: "NOT_FOUND",
    };
  }

  return {
    success: true,
    post: updateResult.post,
    board: updateResult.board,
    workspace,
    auditComment: updateResult.auditComment,
    previousStatus: updateResult.previousStatus,
    newStatus,
  };
}

export {
  mergePosts,
  canMergePosts,
  type MergePostsResult,
} from "./merges";

