import { describe, it, expect } from "vitest";
import { createPostSchema, searchDuplicatesSchema } from "@/lib/validation/post";

describe("Post Validation Schemas", () => {
  describe("createPostSchema", () => {
    it("accepts valid title and description", () => {
      const valid = {
        title: "Export reports to CSV format",
        description: "Admins should be able to download customer submissions as CSV files.",
        boardSlug: "features",
      };

      const result = createPostSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects title shorter than 5 characters", () => {
      const invalid = {
        title: "Bug",
        description: "This description is longer than twenty characters easily.",
      };

      const result = createPostSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0]?.message;
        expect(error).toMatch(/at least 5 characters/i);
      }
    });

    it("rejects title exceeding 255 characters", () => {
      const invalid = {
        title: "A".repeat(256),
        description: "This description is longer than twenty characters easily.",
      };

      const result = createPostSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0]?.message;
        expect(error).toMatch(/cannot exceed 255 characters/i);
      }
    });

    it("rejects description shorter than 20 characters", () => {
      const invalid = {
        title: "Valid Title Here",
        description: "Too short desc",
      };

      const result = createPostSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0]?.message;
        expect(error).toMatch(/at least 20 characters/i);
      }
    });
  });

  describe("searchDuplicatesSchema", () => {
    it("accepts valid search query with limit", () => {
      const valid = {
        query: "dark mode",
        limit: 10,
      };

      const result = searchDuplicatesSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects search query shorter than 2 characters", () => {
      const invalid = {
        query: "a",
      };

      const result = searchDuplicatesSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
