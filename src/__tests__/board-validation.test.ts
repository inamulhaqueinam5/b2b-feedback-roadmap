import { describe, it, expect } from "vitest";
import {
  createBoardSchema,
  updateBoardSchema,
  reorderBoardsSchema,
  isValidBoardSlug,
  sanitizeBoardSlug,
} from "@/lib/validation/board";

describe("Board Slug Validation", () => {
  it("accepts valid URL-friendly slugs", () => {
    expect(isValidBoardSlug("feature-requests")).toBe(true);
    expect(isValidBoardSlug("bug-reports")).toBe(true);
    expect(isValidBoardSlug("integrations")).toBe(true);
    expect(isValidBoardSlug("v2-ideas")).toBe(true);
  });

  it("rejects invalid slugs with uppercase, spaces or special characters", () => {
    expect(isValidBoardSlug("Feature-Requests")).toBe(false);
    expect(isValidBoardSlug("feature requests")).toBe(false);
    expect(isValidBoardSlug("feature_requests")).toBe(false);
    expect(isValidBoardSlug("feature--requests")).toBe(false);
    expect(isValidBoardSlug("-feature")).toBe(false);
    expect(isValidBoardSlug("feature-")).toBe(false);
    expect(isValidBoardSlug("a")).toBe(false);
  });

  it("sanitizes messy input into valid kebab-case slug", () => {
    expect(sanitizeBoardSlug("  Feature Requests! ")).toBe("feature-requests");
    expect(sanitizeBoardSlug("Mobile App & Tablet Bugs")).toBe("mobile-app-tablet-bugs");
    expect(sanitizeBoardSlug("---multiple---dashes---")).toBe("multiple-dashes");
  });
});

describe("Create Board Schema", () => {
  it("validates valid board input with defaults", () => {
    const input = {
      name: "Feature Requests",
      slug: "feature-requests",
    };

    const parsed = createBoardSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Feature Requests");
      expect(parsed.data.slug).toBe("feature-requests");
      expect(parsed.data.icon).toBe("message-square");
      expect(parsed.data.isPrivate).toBe(false);
    }
  });

  it("validates full board creation with custom icon, description and private flag", () => {
    const input = {
      name: "Internal Roadmap",
      slug: "internal-roadmap",
      description: "Confidential upcoming features for enterprise partners",
      icon: "shield",
      isPrivate: true,
    };

    const parsed = createBoardSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isPrivate).toBe(true);
      expect(parsed.data.icon).toBe("shield");
      expect(parsed.data.description).toBe(
        "Confidential upcoming features for enterprise partners"
      );
    }
  });

  it("rejects board with empty or too short name", () => {
    const parsed = createBoardSchema.safeParse({
      name: "A",
      slug: "valid-slug",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid slug format", () => {
    const parsed = createBoardSchema.safeParse({
      name: "Bug Reports",
      slug: "Bug Reports!",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("Update Board Schema", () => {
  it("allows partial updates", () => {
    const parsed = updateBoardSchema.safeParse({
      name: "Updated Name",
      isPrivate: true,
    });

    expect(parsed.success).toBe(true);
  });

  it("validates archiving flag", () => {
    const parsed = updateBoardSchema.safeParse({
      isArchived: true,
    });

    expect(parsed.success).toBe(true);
  });
});

describe("Reorder Boards Schema", () => {
  it("validates list of board IDs and sort order", () => {
    const parsed = reorderBoardsSchema.safeParse({
      items: [
        { id: "a0000000-0000-0000-0000-000000000001", sortOrder: 0 },
        { id: "a0000000-0000-0000-0000-000000000002", sortOrder: 1 },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid UUIDs or negative sort order", () => {
    const parsed = reorderBoardsSchema.safeParse({
      items: [{ id: "not-a-uuid", sortOrder: -1 }],
    });

    expect(parsed.success).toBe(false);
  });
});
