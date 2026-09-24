import { eq, and, desc, isNull } from "drizzle-orm";
import {
  posts,
  postUpvotes,
  postSubscribers,
  type Post,
  type PostStatus,
} from "@/db/schema/posts";
import { boards, type Board } from "@/db/schema/boards";
import { comments, type Comment } from "@/db/schema/comments";
import { users } from "@/db/schema/auth";
import type { DbClient } from "@/db/repositories/workspaces";

export interface CreatePostParams {
  workspaceId: string;
  boardId: string;
  authorId: string;
  title: string;
  description: string;
  status?: PostStatus;
  upvoteCount?: number;
}

export interface SearchSimilarPostsParams {
  workspaceId: string;
  query: string;
  boardId?: string;
  limit?: number;
  threshold?: number;
}

export interface SimilarPost extends Post {
  similarity: number;
  boardName?: string;
}

/**
 * Extracts character trigrams from string for similarity calculation.
 */
export function extractTrigrams(str: string): Set<string> {
  const normalized = `  ${str.toLowerCase().trim()} `;
  const trigrams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Computes Jaccard similarity between character trigram sets.
 */
export function calculateTrigramSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1;

  const t1 = extractTrigrams(s1);
  const t2 = extractTrigrams(s2);

  if (t1.size === 0 || t2.size === 0) return 0;

  let intersectionCount = 0;
  for (const tri of t1) {
    if (t2.has(tri)) {
      intersectionCount++;
    }
  }

  const unionSize = t1.size + t2.size - intersectionCount;
  if (unionSize === 0) return 0;

  return intersectionCount / unionSize;
}

/**
 * Computes word token coverage between query and candidate text.
 */
export function calculateTokenSimilarity(query: string, target: string): number {
  const qWords = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  const tWords = new Set(
    target
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 2)
  );

  if (qWords.length === 0 || tWords.size === 0) return 0;

  let matchedWords = 0;
  for (const w of qWords) {
    if (tWords.has(w)) {
      matchedWords++;
    } else {
      for (const tw of tWords) {
        if (tw.startsWith(w) || w.startsWith(tw)) {
          matchedWords += 0.5;
          break;
        }
      }
    }
  }

  return matchedWords / qWords.length;
}

/**
 * Combined similarity score leveraging trigram matching, token coverage and exact substring detection.
 */
export function computeSimilarityScore(target: string, query: string): number {
  const normTarget = target.toLowerCase().trim();
  const normQuery = query.toLowerCase().trim();

  if (normTarget === normQuery) return 1.0;

  const containsExact = normTarget.includes(normQuery);
  const triSim = calculateTrigramSimilarity(normTarget, normQuery);
  const tokenSim = calculateTokenSimilarity(normQuery, normTarget);

  let combined = triSim * 0.6 + tokenSim * 0.4;
  if (containsExact) {
    combined = Math.max(combined, 0.5 + triSim * 0.5);
  }

  return Math.min(1.0, Math.round(combined * 100) / 100);
}

/**
 * Executes a transaction creating a post, author upvote record and author subscription record.
 */
export async function createPostWithInitialUpvote(
  db: DbClient,
  data: CreatePostParams
): Promise<Post> {
  return await db.transaction(async (tx) => {
    const [createdPost] = await tx
      .insert(posts)
      .values({
        workspaceId: data.workspaceId,
        boardId: data.boardId,
        authorId: data.authorId,
        title: data.title.trim(),
        description: data.description.trim(),
        status: data.status ?? "open",
        upvoteCount: data.upvoteCount ?? 1,
      })
      .returning();

    await tx.insert(postUpvotes).values({
      postId: createdPost.id,
      userId: data.authorId,
    });

    await tx.insert(postSubscribers).values({
      postId: createdPost.id,
      userId: data.authorId,
    });

    return createdPost;
  });
}

/**
 * Searches potential duplicate posts in workspace using trigram similarity and token matching.
 * Strictly scoped to tenant workspaceId.
 */
export async function searchSimilarPosts(
  db: DbClient,
  params: SearchSimilarPostsParams
): Promise<SimilarPost[]> {
  const query = params.query.trim();
  if (query.length < 2) {
    return [];
  }

  const conditions = [
    eq(posts.workspaceId, params.workspaceId),
    isNull(posts.mergedIntoPostId),
  ];

  if (params.boardId) {
    conditions.push(eq(posts.boardId, params.boardId));
  }

  const candidatePosts = await db
    .select({
      post: posts,
      boardName: boards.name,
    })
    .from(posts)
    .leftJoin(boards, eq(posts.boardId, boards.id))
    .where(and(...conditions));

  const threshold = params.threshold ?? 0.2;
  const limit = params.limit ?? 5;

  const scored: SimilarPost[] = candidatePosts
    .map(({ post, boardName }) => {
      const similarity = computeSimilarityScore(post.title, query);
      return {
        ...post,
        similarity,
        boardName: boardName ?? undefined,
      };
    })
    .filter((item) => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return scored;
}

/**
 * Finds post by id with optional workspace scope.
 */
export async function findPostById(
  db: DbClient,
  workspaceIdOrPostId: string,
  maybePostId?: string
): Promise<Post | null> {
  const workspaceId = maybePostId ? workspaceIdOrPostId : undefined;
  const postId = maybePostId ? maybePostId : workspaceIdOrPostId;

  const conditions = [eq(posts.id, postId)];
  if (workspaceId) {
    conditions.push(eq(posts.workspaceId, workspaceId));
  }

  const [found] = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .limit(1);

  return found ?? null;
}

/**
 * Finds post with related board and author metadata.
 */
export async function findPostWithDetailsById(
  db: DbClient,
  workspaceId: string,
  postId: string
): Promise<{
  post: Post;
  board: { id: string; name: string; slug: string; isPrivate: boolean };
  author: { id: string; name: string | null; image: string | null; email: string };
} | null> {
  const [row] = await db
    .select({
      post: posts,
      board: {
        id: boards.id,
        name: boards.name,
        slug: boards.slug,
        isPrivate: boards.isPrivate,
      },
      author: {
        id: users.id,
        name: users.name,
        image: users.image,
        email: users.email,
      },
    })
    .from(posts)
    .innerJoin(boards, eq(posts.boardId, boards.id))
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId)))
    .limit(1);

  return row ?? null;
}

/**
 * Checks whether user has upvoted a post.
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
 * Checks whether user is subscribed to a post.
 */
export async function isUserSubscribedToPost(
  db: DbClient,
  postId: string,
  userId: string
): Promise<boolean> {
  const [found] = await db
    .select({ id: postSubscribers.id })
    .from(postSubscribers)
    .where(and(eq(postSubscribers.postId, postId), eq(postSubscribers.userId, userId)))
    .limit(1);

  return !!found;
}

/**
 * Finds posts belonging to a board with optional filtering and sorting.
 */
export async function findPostsByBoard(
  db: DbClient,
  workspaceIdOrBoardId: string,
  maybeBoardIdOrOptions?:
    | string
    | {
        limit?: number;
        offset?: number;
        status?: PostStatus;
        sortBy?: "newest" | "top" | "trending";
      },
  maybeOptions?: {
    limit?: number;
    offset?: number;
    status?: PostStatus;
    sortBy?: "newest" | "top" | "trending";
  }
): Promise<Post[]> {
  let workspaceId: string | undefined;
  let boardId: string;
  let options:
    | {
        limit?: number;
        offset?: number;
        status?: PostStatus;
        sortBy?: "newest" | "top" | "trending";
      }
    | undefined;

  if (typeof maybeBoardIdOrOptions === "string") {
    workspaceId = workspaceIdOrBoardId;
    boardId = maybeBoardIdOrOptions;
    options = maybeOptions;
  } else {
    boardId = workspaceIdOrBoardId;
    options = maybeBoardIdOrOptions;
  }

  const conditions = [eq(posts.boardId, boardId)];
  if (workspaceId) {
    conditions.push(eq(posts.workspaceId, workspaceId));
  }
  if (options?.status) {
    conditions.push(eq(posts.status, options.status));
  }

  let query = db.select().from(posts).where(and(...conditions));

  if (options?.sortBy === "top") {
    query = query.orderBy(desc(posts.upvoteCount), desc(posts.createdAt)) as typeof query;
  } else if (options?.sortBy === "trending") {
    query = query.orderBy(desc(posts.upvoteCount), desc(posts.createdAt)) as typeof query;
  } else {
    query = query.orderBy(desc(posts.createdAt)) as typeof query;
  }

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }

  return await query;
}

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  open: "Open",
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
};

export function formatStatusLabel(status: PostStatus | string): string {
  if (status in POST_STATUS_LABELS) {
    return POST_STATUS_LABELS[status as PostStatus];
  }
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export interface UpdatePostStatusParams {
  workspaceId: string;
  postId: string;
  newStatus: PostStatus;
  authorId: string;
}

export interface UpdatePostStatusRecordResult {
  post: Post;
  board: Board;
  auditComment: Comment;
  previousStatus: PostStatus;
}

/**
 * Updates post status and creates an automated system audit comment within an atomic transaction.
 */
export async function updatePostStatusWithAudit(
  db: DbClient,
  params: UpdatePostStatusParams
): Promise<UpdatePostStatusRecordResult | null> {
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        post: posts,
        board: boards,
      })
      .from(posts)
      .innerJoin(boards, eq(posts.boardId, boards.id))
      .where(and(eq(posts.id, params.postId), eq(posts.workspaceId, params.workspaceId)))
      .limit(1);

    if (!existing) {
      return null;
    }

    const previousStatus = existing.post.status as PostStatus;

    const [updatedPost] = await tx
      .update(posts)
      .set({
        status: params.newStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, params.postId), eq(posts.workspaceId, params.workspaceId)))
      .returning();

    const previousLabel = formatStatusLabel(previousStatus);
    const newLabel = formatStatusLabel(params.newStatus);

    const [auditComment] = await tx
      .insert(comments)
      .values({
        postId: params.postId,
        authorId: params.authorId,
        content: `Changed status from ${previousLabel} to ${newLabel}`,
        isInternalNote: false,
        isSystemAudit: true,
      })
      .returning();

    return {
      post: updatedPost,
      board: existing.board,
      auditComment,
      previousStatus,
    };
  });
}
