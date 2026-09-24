import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import { createPostWithInitialUpvote } from "@/db/repositories/posts";
import {
  createComment,
  findCommentsByPostId,
  findCommentById,
  findCommentWithPost,
  updateComment,
  deleteComment,
} from "@/db/repositories/comments";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";
import type { Post } from "@/db/schema/posts";

describe("Comment Repository CRUD", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace: Workspace;
  let board: Board;
  let post: Post;
  let user1: User;
  let user2: User;

  beforeAll(async () => {
    db = await getTestDb();

    workspace = await createWorkspaceRecord(db, {
      name: "Comment Repo Space",
      slug: "comment-repo-space",
    });

    board = await createBoardRecord(db, workspace.id, {
      name: "Feature Discussions",
      slug: "feature-discussions",
    });

    user1 = await createUserRecord(db, {
      name: "User One",
      email: "user1@repo.test",
    });

    user2 = await createUserRecord(db, {
      name: "User Two",
      email: "user2@repo.test",
    });

    post = await createPostWithInitialUpvote(db, {
      workspaceId: workspace.id,
      boardId: board.id,
      authorId: user1.id,
      title: "Interactive Roadmap Filtering",
      description: "Allow filtering roadmap columns by release quarter and priority tags.",
    });
  });

  it("creates a comment and persists it", async () => {
    const created = await createComment(db, {
      postId: post.id,
      authorId: user1.id,
      content: "First test comment in discussion thread",
    });

    expect(created.id).toBeDefined();
    expect(created.postId).toBe(post.id);
    expect(created.authorId).toBe(user1.id);
    expect(created.content).toBe("First test comment in discussion thread");
    expect(created.isInternalNote).toBe(false);
    expect(created.isSystemAudit).toBe(false);
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it("finds comments by post ID in chronological order", async () => {
    await createComment(db, {
      postId: post.id,
      authorId: user2.id,
      content: "Second test comment",
    });

    const comments = await findCommentsByPostId(db, post.id);
    expect(comments.length).toBeGreaterThanOrEqual(2);

    expect(comments[0].author.name).toBe("User One");
    expect(comments[1].author.name).toBe("User Two");
  });

  it("finds comment with post metadata for tenancy checks", async () => {
    const created = await createComment(db, {
      postId: post.id,
      authorId: user2.id,
      content: "Tenancy check comment",
    });

    const detailed = await findCommentWithPost(db, created.id);
    expect(detailed).not.toBeNull();
    if (detailed) {
      expect(detailed.id).toBe(created.id);
      expect(detailed.post.workspaceId).toBe(workspace.id);
      expect(detailed.author.email).toBe(user2.email);
    }
  });

  it("updates comment content and updates timestamp", async () => {
    const created = await createComment(db, {
      postId: post.id,
      authorId: user1.id,
      content: "Pre-update content",
    });

    const updated = await updateComment(db, created.id, "Post-update content");
    expect(updated).not.toBeNull();
    if (updated) {
      expect(updated.content).toBe("Post-update content");
    }

    const fetched = await findCommentById(db, created.id);
    expect(fetched?.content).toBe("Post-update content");
  });

  it("deletes comment by ID", async () => {
    const created = await createComment(db, {
      postId: post.id,
      authorId: user1.id,
      content: "Comment to delete",
    });

    const success = await deleteComment(db, created.id);
    expect(success).toBe(true);

    const check = await findCommentById(db, created.id);
    expect(check).toBeNull();
  });
});
