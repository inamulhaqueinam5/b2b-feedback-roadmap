import { z } from "zod";

export const createPostSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(255, "Title cannot exceed 255 characters"),
  description: z
    .string()
    .trim()
    .min(20, "Description must be at least 20 characters")
    .max(10000, "Description cannot exceed 10000 characters"),
  boardId: z.string().uuid("Invalid board ID").optional(),
  boardSlug: z.string().trim().min(2).max(48).optional(),
});

export const searchDuplicatesSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, "Search query must be at least 2 characters"),
  workspaceSlug: z.string().trim().min(1).optional(),
  workspaceId: z.string().uuid().optional(),
  boardId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

export type CreatePostInput = z.input<typeof createPostSchema>;
export type CreatePostOutput = z.output<typeof createPostSchema>;

export type SearchDuplicatesInput = z.input<typeof searchDuplicatesSchema>;
export type SearchDuplicatesOutput = z.output<typeof searchDuplicatesSchema>;
