import { z } from "zod";

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "login",
  "logout",
  "new",
  "roadmap",
  "settings",
  "signup",
  "user",
  "users",
  "w",
]);

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlugFormat(slug: string): boolean {
  if (slug.length < 2 || slug.length > 48) {
    return false;
  }
  return SLUG_REGEX.test(slug);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters")
    .max(64, "Workspace name cannot exceed 64 characters"),
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(48, "Slug cannot exceed 48 characters")
    .refine((val) => isValidSlugFormat(val), {
      message: "Slug can only contain lowercase letters, numbers and single hyphens",
    })
    .refine((val) => !isReservedSlug(val), {
      message: "This slug is reserved and cannot be used",
    }),
  brandColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Invalid hex color code")
    .default("#0ea5e9"),
  logoUrl: z.string().url("Invalid URL").optional().nullable(),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
