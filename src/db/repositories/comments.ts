import { eq, and, asc } from "drizzle-orm";
import { comments, type Comment } from "@/db/schema/comments";
import { users } from "@/db/schema/auth";
import { posts } from "@/db/schema/posts";
import type { DbClient } from "@/db/repositories/workspaces";

export interface CreateCommentParams {
  postId: string;
  authorId: string;
  content: string;
  isInternalNote?: boolean;
  isSystemAudit?: boolean;
  createdAt?: Date;
}

export interface CommentWithAuthor {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  isInternalNote: boolean;
  isSystemAudit: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export interface CommentWithPostAndAuthor extends CommentWithAuthor {
  post: {
    id: string;
    workspaceId: string;
    boardId: string;
  };
}

/**
 * Creates a new comment record for a post.
 */
export async function createComment(
  db: DbClient,
  data: CreateCommentParams
): Promise<Comment> {
  const [created] = await db
    .insert(comments)
    .values({
      postId: data.postId,
      authorId: data.authorId,
      content: data.content.trim(),
      isInternalNote: data.isInternalNote ?? false,
      isSystemAudit: data.isSystemAudit ?? false,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    })
    .returning();

  return created;
}

/**
 * Retrieves comments for a given post ordered chronologically.
 */
export async function findCommentsByPostId(
  db: DbClient,
  postId: string,
  options?: {
    includeInternal?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<CommentWithAuthor[]> {
  const conditions = [eq(comments.postId, postId)];
  if (!options?.includeInternal) {
    conditions.push(eq(comments.isInternalNote, false));
  }

  let query = db
    .select({
      id: comments.id,
      postId: comments.postId,
      authorId: comments.authorId,
      content: comments.content,
      isInternalNote: comments.isInternalNote,
      isSystemAudit: comments.isSystemAudit,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      },
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(and(...conditions))
    .orderBy(asc(comments.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }

  return await query;
}

/**
 * Finds a single comment by ID.
 */
export async function findCommentById(
  db: DbClient,
  commentId: string
): Promise<Comment | null> {
  const [found] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  return found ?? null;
}

/**
 * Finds a single comment by ID with author and parent post metadata for multi-tenant verification.
 */
export async function findCommentWithPost(
  db: DbClient,
  commentId: string
): Promise<CommentWithPostAndAuthor | null> {
  const [row] = await db
    .select({
      id: comments.id,
      postId: comments.postId,
      authorId: comments.authorId,
      content: comments.content,
      isInternalNote: comments.isInternalNote,
      isSystemAudit: comments.isSystemAudit,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      },
      post: {
        id: posts.id,
        workspaceId: posts.workspaceId,
        boardId: posts.boardId,
      },
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .innerJoin(posts, eq(comments.postId, posts.id))
    .where(eq(comments.id, commentId))
    .limit(1);

  return row ?? null;
}

/**
 * Updates comment content and refreshes the updatedAt timestamp.
 */
export async function updateComment(
  db: DbClient,
  commentId: string,
  content: string
): Promise<Comment | null> {
  const [updated] = await db
    .update(comments)
    .set({
      content: content.trim(),
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentId))
    .returning();

  return updated ?? null;
}

/**
 * Deletes a comment record by ID.
 */
export async function deleteComment(
  db: DbClient,
  commentId: string
): Promise<boolean> {
  const deleted = await db
    .delete(comments)
    .where(eq(comments.id, commentId))
    .returning({ id: comments.id });

  return deleted.length > 0;
}
