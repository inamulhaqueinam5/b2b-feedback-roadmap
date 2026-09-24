import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const boards = pgTable(
  "boards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    slug: varchar("slug", { length: 48 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 32 }).default("message-square").notNull(),
    isPrivate: boolean("is_private").default(false).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("boards_workspace_slug_idx").on(table.workspaceId, table.slug),
    index("boards_workspace_active_idx").on(table.workspaceId, table.isArchived, table.sortOrder),
  ]
);

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
