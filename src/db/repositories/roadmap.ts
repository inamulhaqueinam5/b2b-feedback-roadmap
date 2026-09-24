import { eq, and, inArray, isNull, desc, sql } from "drizzle-orm";
import { posts, type Post } from "@/db/schema/posts";
import { boards } from "@/db/schema/boards";
import { comments } from "@/db/schema/comments";
import { getUserUpvotedPostIds } from "@/db/repositories/upvotes";
import type { DbClient } from "@/db/repositories/workspaces";

export type RoadmapStatus = "planned" | "in_progress" | "completed";

export interface RoadmapCard {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  upvoteCount: number;
  hasUpvoted: boolean;
  commentCount: number;
  boardId: string;
  boardName: string;
  boardSlug: string;
  board: {
    id: string;
    name: string;
    slug: string;
    isPrivate: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapColumns {
  planned: RoadmapCard[];
  inProgress: RoadmapCard[];
  completed: RoadmapCard[];
  in_progress: RoadmapCard[];
}

export interface RoadmapData {
  columns: RoadmapColumns;
  counts: {
    planned: number;
    inProgress: number;
    completed: number;
    total: number;
  };
}

export interface GetRoadmapPostsParams {
  workspaceId: string;
  boardId?: string;
  includePrivateBoards?: boolean;
  userId?: string;
}

/**
 * Queries posts for a workspace partitioned into three roadmap columns.
 * Excludes open, under_review and closed posts.
 * Respects board privacy and omits merged or archived entries.
 */
export async function getRoadmapPosts(
  db: DbClient,
  params: GetRoadmapPostsParams
): Promise<RoadmapData> {
  const conditions = [
    eq(posts.workspaceId, params.workspaceId),
    isNull(posts.mergedIntoPostId),
    inArray(posts.status, ["planned", "in_progress", "completed"]),
    eq(boards.isArchived, false),
  ];

  if (params.boardId) {
    conditions.push(eq(posts.boardId, params.boardId));
  }

  if (!params.includePrivateBoards) {
    conditions.push(eq(boards.isPrivate, false));
  }

  const candidateRows = await db
    .select({
      post: posts,
      board: {
        id: boards.id,
        name: boards.name,
        slug: boards.slug,
        isPrivate: boards.isPrivate,
      },
    })
    .from(posts)
    .innerJoin(boards, eq(posts.boardId, boards.id))
    .where(and(...conditions))
    .orderBy(desc(posts.upvoteCount), desc(posts.createdAt));

  if (candidateRows.length === 0) {
    const emptyCols: RoadmapColumns = {
      planned: [],
      inProgress: [],
      completed: [],
      in_progress: [],
    };
    return {
      columns: emptyCols,
      counts: {
        planned: 0,
        inProgress: 0,
        completed: 0,
        total: 0,
      },
    };
  }

  const postIds = candidateRows.map((r) => r.post.id);

  let upvotedSet = new Set<string>();
  if (params.userId) {
    upvotedSet = await getUserUpvotedPostIds(db, postIds, params.userId);
  }

  const commentConditions = [inArray(comments.postId, postIds)];
  if (!params.includePrivateBoards) {
    commentConditions.push(eq(comments.isInternalNote, false));
  }

  const commentCountRows = await db
    .select({
      postId: comments.postId,
      count: sql<number>`cast(count(${comments.id}) as integer)`,
    })
    .from(comments)
    .where(and(...commentConditions))
    .groupBy(comments.postId);

  const commentCountMap = new Map<string, number>();
  for (const row of commentCountRows) {
    commentCountMap.set(row.postId, Number(row.count) || 0);
  }

  const planned: RoadmapCard[] = [];
  const inProgress: RoadmapCard[] = [];
  const completed: RoadmapCard[] = [];

  for (const row of candidateRows) {
    const card: RoadmapCard = {
      id: row.post.id,
      title: row.post.title,
      description: row.post.description,
      status: row.post.status as RoadmapStatus,
      upvoteCount: row.post.upvoteCount,
      hasUpvoted: upvotedSet.has(row.post.id),
      commentCount: commentCountMap.get(row.post.id) ?? 0,
      boardId: row.board.id,
      boardName: row.board.name,
      boardSlug: row.board.slug,
      board: {
        id: row.board.id,
        name: row.board.name,
        slug: row.board.slug,
        isPrivate: row.board.isPrivate,
      },
      createdAt: row.post.createdAt,
      updatedAt: row.post.updatedAt,
    };

    if (card.status === "planned") {
      planned.push(card);
    } else if (card.status === "in_progress") {
      inProgress.push(card);
    } else if (card.status === "completed") {
      completed.push(card);
    }
  }

  return {
    columns: {
      planned,
      inProgress,
      completed,
      in_progress: inProgress,
    },
    counts: {
      planned: planned.length,
      inProgress: inProgress.length,
      completed: completed.length,
      total: planned.length + inProgress.length + completed.length,
    },
  };
}
