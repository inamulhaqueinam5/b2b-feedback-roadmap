import { describe, it, expect } from "vitest";
import {
  commentContentSchema,
  createCommentSchema,
  updateCommentSchema,
  validateCommentContent,
} from "@/lib/validation/comment";

describe("Comment Validation", () => {
  it("accepts valid comment content", () => {
    const validText = "This is a great feature proposal!";
    const res = commentContentSchema.safeParse(validText);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toBe(validText);
    }
  });

  it("trims leading and trailing whitespace", () => {
    const padded = "   Helpful feedback message   ";
    const res = commentContentSchema.safeParse(padded);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toBe("Helpful feedback message");
    }
  });

  it("rejects empty string", () => {
    const res = commentContentSchema.safeParse("");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toMatch(/cannot be empty/i);
    }
  });

  it("rejects whitespace-only string", () => {
    const res = commentContentSchema.safeParse("    \n\t   ");
    expect(res.success).toBe(false);
  });

  it("accepts single character comment", () => {
    const res = commentContentSchema.safeParse("+");
    expect(res.success).toBe(true);
  });

  it("accepts comment with exactly 5000 characters", () => {
    const maxContent = "a".repeat(5000);
    const res = commentContentSchema.safeParse(maxContent);
    expect(res.success).toBe(true);
  });

  it("rejects comment exceeding 5000 characters", () => {
    const oversized = "a".repeat(5001);
    const res = commentContentSchema.safeParse(oversized);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toMatch(/cannot exceed 5000 characters/i);
    }
  });

  it("validates createCommentSchema object", () => {
    const res = createCommentSchema.safeParse({
      content: "Valid discussion note",
      isInternalNote: true,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.content).toBe("Valid discussion note");
      expect(res.data.isInternalNote).toBe(true);
    }
  });

  it("validates updateCommentSchema object", () => {
    const res = updateCommentSchema.safeParse({
      content: "Updated wording here",
    });
    expect(res.success).toBe(true);
  });

  it("validates using helper function validateCommentContent", () => {
    const good = validateCommentContent("Quick feedback");
    expect(good.success).toBe(true);
    expect(good.data).toBe("Quick feedback");

    const bad = validateCommentContent("");
    expect(bad.success).toBe(false);
    expect(bad.error).toBeDefined();
  });
});
