import { z } from "zod";

export const commentContentSchema = z
  .string()
  .trim()
  .min(1, "Comment content cannot be empty")
  .max(5000, "Comment content cannot exceed 5000 characters");

export const createCommentSchema = z.object({
  content: commentContentSchema,
  isInternalNote: z.boolean().optional().default(false),
});

export const updateCommentSchema = z.object({
  content: commentContentSchema,
});

export type CreateCommentInput = z.input<typeof createCommentSchema>;
export type CreateCommentOutput = z.output<typeof createCommentSchema>;

export type UpdateCommentInput = z.input<typeof updateCommentSchema>;
export type UpdateCommentOutput = z.output<typeof updateCommentSchema>;

export function validateCommentContent(content: unknown): {
  success: boolean;
  data?: string;
  error?: string;
} {
  const result = commentContentSchema.safeParse(content);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => i.message).join("; "),
  };
}
