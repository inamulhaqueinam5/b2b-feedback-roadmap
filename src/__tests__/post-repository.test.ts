import { describe, it, expect, beforeAll } from "vitest";
import { getTestDb } from "@/db/test-db";
import { createWorkspaceRecord } from "@/db/repositories/workspaces";
import { createBoardRecord } from "@/db/repositories/boards";
import { createUserRecord } from "@/db/repositories/auth";
import {
  createPostWithInitialUpvote,
  searchSimilarPosts,
  findPostById,
  findPostsByBoard,
  hasUserUpvotedPost,
  isUserSubscribedToPost,
  calculateTrigramSimilarity,
  computeSimilarityScore,
} from "@/db/repositories/posts";
import type { Workspace } from "@/db/schema/workspaces";
import type { Board } from "@/db/schema/boards";
import type { User } from "@/db/schema/auth";

describe("Post Repository", () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let workspace1: Workspace;
  let workspace2: Workspace;
  let board1: Board;
  let board2: Board;
  let boardOtherWs: Board;
  let user1: User;
  let user2: User;

  beforeAll(async () => {
    db = await getTestDb();

    workspace1 = await createWorkspaceRecord(db, {
      name: "Acme Feedback",
      slug: "acme-feedback-repo",
    });

    workspace2 = await createWorkspaceRecord(db, {
      name: "Beta Feedback",
      slug: "beta-feedback-repo",
    });

    board1 = await createBoardRecord(db, workspace1.id, {
      name: "Features",
      slug: "features-repo",
    });

    board2 = await createBoardRecord(db, workspace1.id, {
      name: "Bugs",
      slug: "bugs-repo",
    });

    boardOtherWs = await createBoardRecord(db, workspace2.id, {
      name: "Features",
      slug: "features-repo-ws2",
    });

    user1 = await createUserRecord(db, {
      email: "author-repo-1@example.com",
      name: "Alice Author",
    });

    user2 = await createUserRecord(db, {
      email: "author-repo-2@example.com",
      name: "Bob Observer",
    });
  });

  describe("createPostWithInitialUpvote", () => {
    it("creates post with default open status, initial upvote count of 1 and author upvote plus subscription records", async () => {
      const post = await createPostWithInitialUpvote(db, {
        workspaceId: workspace1.id,
        boardId: board1.id,
        authorId: user1.id,
        title: "Add Dark Mode Support",
        description: "Please implement dark mode to reduce eye strain during late work sessions.",
      });

      expect(post.id).toBeDefined();
      expect(post.workspaceId).toBe(workspace1.id);
      expect(post.boardId).toBe(board1.id);
      expect(post.authorId).toBe(user1.id);
      expect(post.title).toBe("Add Dark Mode Support");
      expect(post.status).toBe("open");
      expect(post.upvoteCount).toBe(1);

      // Verify author is automatically registered as upvoter
      const authorHasUpvoted = await hasUserUpvotedPost(db, post.id, user1.id);
      expect(authorHasUpvoted).toBe(true);

      const otherHasUpvoted = await hasUserUpvotedPost(db, post.id, user2.id);
      expect(otherHasUpvoted).toBe(false);

      // Verify author is automatically registered as subscriber
      const authorIsSubscribed = await isUserSubscribedToPost(db, post.id, user1.id);
      expect(authorIsSubscribed).toBe(true);

      const otherIsSubscribed = await isUserSubscribedToPost(db, post.id, user2.id);
      expect(otherIsSubscribed).toBe(false);
    });
  });

  describe("searchSimilarPosts & Duplicate Detection Ranking", () => {
    beforeAll(async () => {
      // Seed distinct posts in workspace1
      await createPostWithInitialUpvote(db, {
        workspaceId: workspace1.id,
        boardId: board1.id,
        authorId: user1.id,
        title: "Integrate with Slack notifications",
        description: "Receive realtime webhook notifications inside designated Slack team channels.",
      });

      await createPostWithInitialUpvote(db, {
        workspaceId: workspace1.id,
        boardId: board1.id,
        authorId: user1.id,
        title: "Export customer feedback to CSV",
        description: "Allow workspace admins to download filtered feedback reports in spreadsheet formats.",
      });

      await createPostWithInitialUpvote(db, {
        workspaceId: workspace1.id,
        boardId: board2.id,
        authorId: user2.id,
        title: "Dark mode causes header contrast flickering",
        description: "When toggling system theme in Chrome, the top navigation header flashes white.",
      });

      // Seed identical title in workspace2 to test cross-tenant isolation
      await createPostWithInitialUpvote(db, {
        workspaceId: workspace2.id,
        boardId: boardOtherWs.id,
        authorId: user2.id,
        title: "Add Dark Mode Support",
        description: "Identical post created in different workspace for tenant boundary verification.",
      });
    });

    it("ranks exact and near-match duplicates at the top", async () => {
      const results = await searchSimilarPosts(db, {
        workspaceId: workspace1.id,
        query: "dark mode support",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe("Add Dark Mode Support");
      expect(results[0].similarity).toBeGreaterThan(0.5);

      // Verify similarity scores are sorted in descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
      }
    });

    it("strictly isolates duplicate search to tenant workspaceId", async () => {
      const resultsInWs1 = await searchSimilarPosts(db, {
        workspaceId: workspace1.id,
        query: "Add Dark Mode Support",
      });

      // All returned posts must belong exclusively to workspace1
      for (const item of resultsInWs1) {
        expect(item.workspaceId).toBe(workspace1.id);
        expect(item.workspaceId).not.toBe(workspace2.id);
      }

      // Search in workspace2 must only return workspace2 posts
      const resultsInWs2 = await searchSimilarPosts(db, {
        workspaceId: workspace2.id,
        query: "Add Dark Mode Support",
      });

      for (const item of resultsInWs2) {
        expect(item.workspaceId).toBe(workspace2.id);
      }
    });

    it("filters duplicate suggestions to specific board when boardId is provided", async () => {
      const board1Results = await searchSimilarPosts(db, {
        workspaceId: workspace1.id,
        query: "dark mode",
        boardId: board1.id,
      });

      for (const item of board1Results) {
        expect(item.boardId).toBe(board1.id);
      }

      const board2Results = await searchSimilarPosts(db, {
        workspaceId: workspace1.id,
        query: "dark mode",
        boardId: board2.id,
      });

      for (const item of board2Results) {
        expect(item.boardId).toBe(board2.id);
      }
    });

    it("returns empty array when query is less than 2 characters", async () => {
      const results = await searchSimilarPosts(db, {
        workspaceId: workspace1.id,
        query: "a",
      });

      expect(results).toEqual([]);
    });
  });

  describe("findPostById", () => {
    it("retrieves a post by id and verifies workspace isolation", async () => {
      const created = await createPostWithInitialUpvote(db, {
        workspaceId: workspace1.id,
        boardId: board1.id,
        authorId: user1.id,
        title: "Single Post Retrieval Test",
        description: "Checking that single post retrieval works properly and respects boundaries.",
      });

      const foundSameWs = await findPostById(db, workspace1.id, created.id);
      expect(foundSameWs).not.toBeNull();
      expect(foundSameWs?.id).toBe(created.id);
      expect(foundSameWs?.title).toBe("Single Post Retrieval Test");

      // Querying with wrong workspace returns null
      const foundWrongWs = await findPostById(db, workspace2.id, created.id);
      expect(foundWrongWs).toBeNull();
    });

    it("returns null for non-existent post id", async () => {
      const found = await findPostById(db, workspace1.id, "00000000-0000-0000-0000-000000000000");
      expect(found).toBeNull();
    });
  });

  describe("findPostsByBoard", () => {
    it("retrieves posts for a board with sorting and workspace scope", async () => {
      const postsOnBoard = await findPostsByBoard(db, workspace1.id, board1.id, {
        sortBy: "top",
      });

      expect(postsOnBoard.length).toBeGreaterThan(0);
      for (const p of postsOnBoard) {
        expect(p.boardId).toBe(board1.id);
        expect(p.workspaceId).toBe(workspace1.id);
      }
    });
  });

  describe("Trigram and Token Similarity Scoring Unit Tests", () => {
    it("computes exact trigram match as 1.0", () => {
      const score = calculateTrigramSimilarity("dark mode", "dark mode");
      expect(score).toBe(1.0);
    });

    it("computes higher score for close phrases and lower for unrelated", () => {
      const closeScore = computeSimilarityScore("Dark Mode Settings", "dark mode");
      const unrelatedScore = computeSimilarityScore("Export CSV Spreadsheet", "dark mode");

      expect(closeScore).toBeGreaterThan(0.5);
      expect(unrelatedScore).toBeLessThan(0.2);
    });
  });
});
