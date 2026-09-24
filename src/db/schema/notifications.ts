import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./auth";
import { posts } from "./posts";

export const notificationTypeEnum = [
  "status_change",
  "admin_comment",
  "merged",
] as const;

export type NotificationType = (typeof notificationTypeEnum)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_workspace_user_idx").on(table.workspaceId, table.userId),
    index("notifications_user_idx").on(table.userId),
    index("notifications_post_idx").on(table.postId),
    index("notifications_created_at_idx").on(table.createdAt),
    index("notifications_user_unread_idx").on(table.userId, table.isRead),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
