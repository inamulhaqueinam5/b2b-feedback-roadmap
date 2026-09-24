import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  numeric,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { boards } from "./boards";
import { users } from "./auth";

export const postStatusEnum = [
  "open",
  "under_review",
  "planned",
  "in_progress",
  "completed",
  "closed",
] as const;

export type PostStatus = (typeof postStatusEnum)[number];

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    status: varchar("status", { length: 32 }).default("open").notNull(),
    upvoteCount: integer("upvote_count").default(1).notNull(),
    associatedMrr: numeric("associated_mrr", { precision: 10, scale: 2 }).default("0"),
    isPinned: boolean("is_pinned").default(false).notNull(),
    mergedIntoPostId: uuid("merged_into_post_id").references(
      (): AnyPgColumn => posts.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("posts_workspace_board_idx").on(table.workspaceId, table.boardId),
    index("posts_workspace_status_idx").on(table.workspaceId, table.status),
    index("posts_author_id_idx").on(table.authorId),
    index("posts_merged_into_idx").on(table.mergedIntoPostId),
  ]
);

export const postUpvotes = pgTable(
  "post_upvotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("post_upvotes_post_user_idx").on(table.postId, table.userId),
    index("post_upvotes_user_id_idx").on(table.userId),
  ]
);

export const postSubscribers = pgTable(
  "post_subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("post_subscribers_post_user_idx").on(table.postId, table.userId),
    index("post_subscribers_user_id_idx").on(table.userId),
  ]
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export type PostUpvote = typeof postUpvotes.$inferSelect;
export type NewPostUpvote = typeof postUpvotes.$inferInsert;

export type PostSubscriber = typeof postSubscribers.$inferSelect;
export type NewPostSubscriber = typeof postSubscribers.$inferInsert;
