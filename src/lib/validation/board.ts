import { z } from "zod";

const BOARD_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const SUPPORTED_BOARD_ICONS = [
  "message-square",
  "bug",
  "sparkles",
  "lightbulb",
  "puzzle",
  "rocket",
  "zap",
  "shield",
  "layers",
  "compass",
  "flame",
  "star",
  "cpu",
  "wrench",
] as const;

export function isValidBoardSlug(slug: string): boolean {
  if (slug.length < 2 || slug.length > 48) {
    return false;
  }
  return BOARD_SLUG_REGEX.test(slug);
}

export function sanitizeBoardSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const createBoardSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Board name must be at least 2 characters")
    .max(64, "Board name cannot exceed 64 characters"),
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(48, "Slug cannot exceed 48 characters")
    .refine((val) => isValidBoardSlug(val), {
      message: "Slug can only contain lowercase letters, numbers and single hyphens",
    }),
  description: z
    .string()
    .trim()
    .max(500, "Description cannot exceed 500 characters")
    .optional()
    .nullable(),
  icon: z
    .string()
    .trim()
    .max(32)
    .default("message-square"),
  isPrivate: z.boolean().default(false),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateBoardSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Board name must be at least 2 characters")
    .max(64, "Board name cannot exceed 64 characters")
    .optional(),
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(48, "Slug cannot exceed 48 characters")
    .refine((val) => isValidBoardSlug(val), {
      message: "Slug can only contain lowercase letters, numbers and single hyphens",
    })
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, "Description cannot exceed 500 characters")
    .optional()
    .nullable(),
  icon: z
    .string()
    .trim()
    .max(32)
    .optional(),
  isPrivate: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const reorderBoardsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid("Invalid board ID"),
      sortOrder: z.number().int().min(0),
    })
  ).min(1, "At least one board item is required"),
});

export type CreateBoardInput = z.input<typeof createBoardSchema>;
export type CreateBoardOutput = z.output<typeof createBoardSchema>;

export type UpdateBoardInput = z.input<typeof updateBoardSchema>;
export type UpdateBoardOutput = z.output<typeof updateBoardSchema>;

export type ReorderBoardsInput = z.input<typeof reorderBoardsSchema>;
