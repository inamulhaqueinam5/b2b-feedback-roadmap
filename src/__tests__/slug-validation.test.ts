import { describe, expect, it } from "vitest";
import { isValidSlugFormat, isReservedSlug, sanitizeSlug } from "@/lib/validation/workspace";

describe("Workspace Slug Validation", () => {
  describe("isValidSlugFormat", () => {
    it("accepts valid lowercase alphanumeric slugs with hyphens", () => {
      expect(isValidSlugFormat("acme")).toBe(true);
      expect(isValidSlugFormat("acme-corp")).toBe(true);
      expect(isValidSlugFormat("team-123")).toBe(true);
      expect(isValidSlugFormat("alpha-beta-gamma")).toBe(true);
    });

    it("rejects uppercase characters", () => {
      expect(isValidSlugFormat("Acme")).toBe(false);
      expect(isValidSlugFormat("ACME-CORP")).toBe(false);
    });

    it("rejects invalid symbols and spaces", () => {
      expect(isValidSlugFormat("acme corp")).toBe(false);
      expect(isValidSlugFormat("acme_corp")).toBe(false);
      expect(isValidSlugFormat("acme!")).toBe(false);
      expect(isValidSlugFormat("acme/corp")).toBe(false);
    });

    it("rejects leading or trailing hyphens", () => {
      expect(isValidSlugFormat("-acme")).toBe(false);
      expect(isValidSlugFormat("acme-")).toBe(false);
      expect(isValidSlugFormat("-acme-")).toBe(false);
    });

    it("rejects consecutive hyphens", () => {
      expect(isValidSlugFormat("acme--corp")).toBe(false);
    });

    it("rejects strings shorter than 2 characters or longer than 48 characters", () => {
      expect(isValidSlugFormat("a")).toBe(false);
      expect(isValidSlugFormat("a".repeat(49))).toBe(false);
      expect(isValidSlugFormat("ab")).toBe(true);
      expect(isValidSlugFormat("a".repeat(48))).toBe(true);
    });
  });

  describe("isReservedSlug", () => {
    it("identifies reserved application slugs", () => {
      expect(isReservedSlug("api")).toBe(true);
      expect(isReservedSlug("admin")).toBe(true);
      expect(isReservedSlug("login")).toBe(true);
      expect(isReservedSlug("new")).toBe(true);
      expect(isReservedSlug("settings")).toBe(true);
      expect(isReservedSlug("auth")).toBe(true);
      expect(isReservedSlug("w")).toBe(true);
    });

    it("allows non-reserved custom company slugs", () => {
      expect(isReservedSlug("acme")).toBe(false);
      expect(isReservedSlug("linear")).toBe(false);
      expect(isReservedSlug("product-hq")).toBe(false);
    });
  });

  describe("sanitizeSlug", () => {
    it("converts raw organization names into clean URL slugs", () => {
      expect(sanitizeSlug("Acme Corp")).toBe("acme-corp");
      expect(sanitizeSlug("Linear & Co.")).toBe("linear-co");
      expect(sanitizeSlug("  My Awesome Product!  ")).toBe("my-awesome-product");
      expect(sanitizeSlug("Multiple---Dashes")).toBe("multiple-dashes");
    });
  });
});
