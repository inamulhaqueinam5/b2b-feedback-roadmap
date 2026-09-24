import {
  createCommentSchema,
  updateCommentSchema,
} from "@/lib/validation/comment";
import {
  createComment as createCommentRecord,
  findCommentsByPostId,
  findCommentWithPost,
  updateComment as updateCommentRecord,
  deleteComment as deleteCommentRecord,
  type CommentWithAuthor,
} from "@/db/repositories/comments";
import { findPostById } from "@/db/repositories/posts";
import {
  getWorkspaceRecordById,
  getWorkspaceRecordBySlug,
  type DbClient,
} from "@/db/repositories/workspaces";
import { listWorkspaceMembers } from "@/db/repositories/auth";
import { getUserWorkspaceRole } from "@/services/auth";
import { canViewPrivateBoards, type ActorContext } from "@/services/boards";
import type { Comment } from "@/db/schema/comments";

export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function isWithinCommentEditWindow(
  createdAt: Date | string | number,
  now = Date.now()
): boolean {
  const createdTime = new Date(createdAt).getTime();
  return now - createdTime <= COMMENT_EDIT_WINDOW_MS;
}

export interface CommentAuthor {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface CommentItem {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  isInternalNote: boolean;
  isSystemAudit: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: CommentAuthor;
  isTeamMember: boolean;
  authorRole: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

export type CreateCommentResult =
  | { success: true; comment: CommentItem }
  | { success: false; error: string; code?: string };

export type UpdateCommentResult =
  | { success: true; comment: CommentItem }
  | { success: false; error: string; code?: string };

export type DeleteCommentResult =
  | { success: true; commentId: string }
  | { success: false; error: string; code?: string };

export type GetPostCommentsResult =
  | { success: true; comments: CommentItem[] }
  | { success: false; error: string; code?: string };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveWorkspace(workspaceIdOrSlug: string, db: DbClient) {
  if (!workspaceIdOrSlug) return null;
  const trimmed = workspaceIdOrSlug.trim();
  if (UUID_REGEX.test(trimmed)) {
    const ws = await getWorkspaceRecordById(db, trimmed);
    if (ws) return ws;
  }
  return await getWorkspaceRecordBySlug(db, trimmed.toLowerCase());
}

/**
 * Creates a comment in a post discussion thread.
 * Enforces visitor authentication barriers and tenant scoping.
 */
export async function createComment(
  workspaceIdOrSlug: string,
  postId: string,
  rawInput: unknown,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<CreateCommentResult> {
  if (!actor?.userId || actor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to post a comment",
      code: "UNAUTHENTICATED",
    };
  }

  const normalizedInput =
    typeof rawInput === "string" ? { content: rawInput } : rawInput;

  const parsed = createCommentSchema.safeParse(normalizedInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join("; ");
    return { success: false, error: errorMsg, code: "VALIDATION_ERROR" };
  }

  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) {
    return { success: false, error: "Workspace not found", code: "NOT_FOUND" };
  }

  const post = await findPostById(db, workspace.id, postId);
  if (!post) {
    return { success: false, error: "Post not found", code: "NOT_FOUND" };
  }

  if (parsed.data.isInternalNote && !canViewPrivateBoards(actor)) {
    return {
      success: false,
      error: "Unauthorized to post confidential internal notes",
      code: "FORBIDDEN",
    };
  }

  const created = await createCommentRecord(db, {
    postId: post.id,
    authorId: actor.userId,
    content: parsed.data.content,
    isInternalNote: parsed.data.isInternalNote ?? false,
  });

  const memberRole = await getUserWorkspaceRole(actor.userId, workspace.id, db);
  const effectiveRole =
    actor.role === "owner" || actor.role === "admin" ? actor.role : memberRole;
  const isTeamMember = effectiveRole === "owner" || effectiveRole === "admin";

  const author: CommentAuthor = {
    id: actor.userId,
    name: actor.user?.name ?? null,
    email: actor.user?.email ?? "",
    image: actor.user?.image ?? null,
  };

  const commentItem: CommentItem = {
    id: created.id,
    postId: created.postId,
    authorId: created.authorId,
    content: created.content,
    isInternalNote: created.isInternalNote,
    isSystemAudit: created.isSystemAudit,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    author,
    isTeamMember,
    authorRole: effectiveRole !== "visitor" ? effectiveRole : null,
    canEdit: true,
    canDelete: true,
  };

  return { success: true, comment: commentItem };
}

/**
 * Retrieves public comments for a post ordered chronologically.
 * Annotates each comment with author details, team badges and action permissions.
 */
export async function getPostComments(
  workspaceIdOrSlug: string,
  postId: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<GetPostCommentsResult> {
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) {
    return { success: false, error: "Workspace not found", code: "NOT_FOUND" };
  }

  const post = await findPostById(db, workspace.id, postId);
  if (!post) {
    return { success: false, error: "Post not found", code: "NOT_FOUND" };
  }

  const canViewInternal = canViewPrivateBoards(actor);
  const commentRows = await findCommentsByPostId(db, postId, {
    includeInternal: canViewInternal,
  });

  const workspaceMembersList = await listWorkspaceMembers(db, workspace.id);
  const roleMap = new Map(
    workspaceMembersList.map((m) => [m.userId, m.role as string])
  );

  const actorEffectiveRole =
    actor?.role === "owner" || actor?.role === "admin"
      ? actor.role
      : actor?.userId
      ? roleMap.get(actor.userId) ?? "visitor"
      : "visitor";
  const isAdmin =
    actorEffectiveRole === "owner" || actorEffectiveRole === "admin";

  const comments: CommentItem[] = commentRows.map((row) => {
    const authorRole = roleMap.get(row.authorId) ?? null;
    const isTeamMember = authorRole === "owner" || authorRole === "admin";
    const isAuthor = Boolean(actor?.userId && actor.userId === row.authorId);
    const within15Mins = isWithinCommentEditWindow(row.createdAt);

    const canEdit = isAdmin || (isAuthor && within15Mins);
    const canDelete = isAdmin || (isAuthor && within15Mins);

    return {
      id: row.id,
      postId: row.postId,
      authorId: row.authorId,
      content: row.content,
      isInternalNote: row.isInternalNote,
      isSystemAudit: row.isSystemAudit,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      author: row.author,
      isTeamMember,
      authorRole,
      canEdit,
      canDelete,
    };
  });

  return { success: true, comments };
}

/**
 * Updates comment content within the 15-minute author edit window or via admin moderation.
 */
export async function updateComment(
  workspaceIdOrSlug: string,
  commentId: string,
  rawInput: unknown,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<UpdateCommentResult> {
  if (!actor?.userId || actor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to edit comments",
      code: "UNAUTHENTICATED",
    };
  }

  const normalizedInput =
    typeof rawInput === "string" ? { content: rawInput } : rawInput;

  const parsed = updateCommentSchema.safeParse(normalizedInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join("; ");
    return { success: false, error: errorMsg, code: "VALIDATION_ERROR" };
  }

  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) {
    return { success: false, error: "Workspace not found", code: "NOT_FOUND" };
  }

  const existing = await findCommentWithPost(db, commentId);
  if (!existing || existing.post.workspaceId !== workspace.id) {
    return { success: false, error: "Comment not found", code: "NOT_FOUND" };
  }

  const memberRole = await getUserWorkspaceRole(actor.userId, workspace.id, db);
  const effectiveRole =
    actor.role === "owner" || actor.role === "admin" ? actor.role : memberRole;
  const isAdmin = effectiveRole === "owner" || effectiveRole === "admin";
  const isAuthor = actor.userId === existing.authorId;

  if (!isAuthor && !isAdmin) {
    return {
      success: false,
      error: "Unauthorized: You do not have permission to edit this comment",
      code: "FORBIDDEN",
    };
  }

  if (isAuthor && !isAdmin) {
    if (!isWithinCommentEditWindow(existing.createdAt)) {
      return {
        success: false,
        error: "Comments can only be edited within 15 minutes of posting",
        code: "TIME_LIMIT_EXCEEDED",
      };
    }
  }

  const updated = await updateCommentRecord(db, commentId, parsed.data.content);
  if (!updated) {
    return {
      success: false,
      error: "Failed to update comment",
      code: "UPDATE_FAILED",
    };
  }

  const authorRole = await getUserWorkspaceRole(existing.authorId, workspace.id, db);
  const isTeamMember = authorRole === "owner" || authorRole === "admin";

  const commentItem: CommentItem = {
    id: updated.id,
    postId: updated.postId,
    authorId: updated.authorId,
    content: updated.content,
    isInternalNote: updated.isInternalNote,
    isSystemAudit: updated.isSystemAudit,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    author: existing.author,
    isTeamMember,
    authorRole: authorRole !== "visitor" ? authorRole : null,
    canEdit: true,
    canDelete: true,
  };

  return { success: true, comment: commentItem };
}

/**
 * Deletes a comment record.
 * Authors may delete within 15 minutes of submission; workspace admins may delete at any time.
 */
export async function deleteComment(
  workspaceIdOrSlug: string,
  commentId: string,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<DeleteCommentResult> {
  if (!actor?.userId || actor.role === "visitor") {
    return {
      success: false,
      error: "Authentication required to delete comments",
      code: "UNAUTHENTICATED",
    };
  }

  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) {
    return { success: false, error: "Workspace not found", code: "NOT_FOUND" };
  }

  const existing = await findCommentWithPost(db, commentId);
  if (!existing || existing.post.workspaceId !== workspace.id) {
    return { success: false, error: "Comment not found", code: "NOT_FOUND" };
  }

  const memberRole = await getUserWorkspaceRole(actor.userId, workspace.id, db);
  const effectiveRole =
    actor.role === "owner" || actor.role === "admin" ? actor.role : memberRole;
  const isAdmin = effectiveRole === "owner" || effectiveRole === "admin";
  const isAuthor = actor.userId === existing.authorId;

  if (!isAuthor && !isAdmin) {
    return {
      success: false,
      error: "Unauthorized: You do not have permission to delete this comment",
      code: "FORBIDDEN",
    };
  }

  if (isAuthor && !isAdmin) {
    if (!isWithinCommentEditWindow(existing.createdAt)) {
      return {
        success: false,
        error: "Comments can only be deleted within 15 minutes of posting",
        code: "TIME_LIMIT_EXCEEDED",
      };
    }
  }

  const deleted = await deleteCommentRecord(db, commentId);
  if (!deleted) {
    return {
      success: false,
      error: "Failed to delete comment",
      code: "DELETE_FAILED",
    };
  }

  return { success: true, commentId };
}
