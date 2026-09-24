import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Please provide a valid email address")
  .max(255, "Email address cannot exceed 255 characters");

export const magicLinkRequestSchema = z.object({
  email: emailSchema,
});

export const magicLinkVerifySchema = z.object({
  token: z.string().trim().min(8, "Verification token must be at least 8 characters"),
  email: emailSchema.optional(),
});

export const oauthSignInSchema = z.object({
  provider: z.enum(["google", "github", "email"]),
  providerAccountId: z.string().trim().min(1, "Provider account ID is required"),
  email: emailSchema,
  name: z.string().trim().max(128, "Name cannot exceed 128 characters").optional().nullable(),
  image: z.string().url("Invalid image URL").optional().nullable(),
});

export const workspaceMemberRoleSchema = z.enum(["owner", "admin", "member", "guest"]);

export const createWorkspaceMemberSchema = z.object({
  workspaceId: z.string().uuid("Invalid workspace ID"),
  userId: z.string().uuid("Invalid user ID"),
  role: workspaceMemberRoleSchema.default("member"),
});

export const updateWorkspaceMemberRoleSchema = z.object({
  workspaceId: z.string().uuid("Invalid workspace ID"),
  userId: z.string().uuid("Invalid user ID"),
  role: workspaceMemberRoleSchema,
});

export type MagicLinkRequestInput = z.input<typeof magicLinkRequestSchema>;
export type MagicLinkVerifyInput = z.input<typeof magicLinkVerifySchema>;
export type OAuthSignInInput = z.input<typeof oauthSignInSchema>;
export type CreateWorkspaceMemberInput = z.input<typeof createWorkspaceMemberSchema>;
export type UpdateWorkspaceMemberRoleInput = z.input<typeof updateWorkspaceMemberRoleSchema>;
