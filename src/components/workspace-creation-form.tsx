"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { sanitizeSlug, isValidSlugFormat } from "@/lib/validation/workspace";
import { validateWorkspaceSlugAction, createWorkspaceAction } from "@/actions/workspaces";

const BRAND_PALETTES = [
  { name: "Sky", value: "#0ea5e9" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Emerald", value: "#10b981" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
];

export function WorkspaceCreationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [brandColor, setBrandColor] = useState(BRAND_PALETTES[0].value);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "unavailable" | "invalid"
  >("idle");
  const [slugFeedback, setSlugFeedback] = useState<string>("");
  const [submitError, setSubmitError] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Debounced slug validation
  const checkSlug = useCallback(async (currentSlug: string) => {
    if (!currentSlug || currentSlug.length < 2) {
      setSlugStatus("invalid");
      setSlugFeedback("Slug must be at least 2 characters");
      return;
    }

    if (!isValidSlugFormat(currentSlug)) {
      setSlugStatus("invalid");
      setSlugFeedback("Use lowercase letters, numbers and single hyphens");
      return;
    }

    setSlugStatus("checking");
    setSlugFeedback("Checking availability...");

    try {
      const result = await validateWorkspaceSlugAction(currentSlug);
      if (result.available) {
        setSlugStatus("available");
        setSlugFeedback("URL is available");
      } else {
        setSlugStatus("unavailable");
        setSlugFeedback(result.error ?? "Slug is not available");
      }
    } catch {
      setSlugStatus("unavailable");
      setSlugFeedback("Could not verify slug availability");
    }
  }, []);

  useEffect(() => {
    if (!slug) {
      setSlugStatus("idle");
      setSlugFeedback("");
      return;
    }

    const timer = setTimeout(() => {
      checkSlug(slug);
    }, 350);

    return () => clearTimeout(timer);
  }, [slug, checkSlug]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!isSlugManuallyEdited) {
      const derived = sanitizeSlug(newName);
      setSlug(derived);
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSlugManuallyEdited(true);
    setSlug(sanitizeSlug(e.target.value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!name.trim()) {
      setSubmitError("Please provide an organization or product name");
      return;
    }

    if (slugStatus !== "available") {
      setSubmitError(slugFeedback || "Please enter a valid, available URL slug");
      return;
    }

    startTransition(async () => {
      const result = await createWorkspaceAction({
        name: name.trim(),
        slug: slug.trim(),
        brandColor,
      });

      if (result.success) {
        router.push(`/w/${result.workspace.slug}`);
      } else {
        setSubmitError(result.error);
      }
    });
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-6 md:p-8 shadow-sm backdrop-blur-sm space-y-6"
      >
        {/* Workspace Name */}
        <div className="space-y-2">
          <label
            htmlFor="workspace-name"
            className="block text-sm font-medium text-slate-900 dark:text-zinc-100"
          >
            Workspace Name
          </label>
          <input
            id="workspace-name"
            type="text"
            required
            placeholder="Acme Corp"
            value={name}
            onChange={handleNameChange}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors text-sm"
          />
        </div>

        {/* Workspace Slug */}
        <div className="space-y-2">
          <label
            htmlFor="workspace-slug"
            className="block text-sm font-medium text-slate-900 dark:text-zinc-100"
          >
            Workspace URL Slug
          </label>
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950 overflow-hidden focus-within:ring-2 focus-within:ring-sky-500/30 focus-within:border-sky-500 transition-colors">
            <span className="px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-400 dark:text-zinc-500 select-none bg-slate-100 dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800">
              /w/
            </span>
            <input
              id="workspace-slug"
              type="text"
              required
              placeholder="acme-corp"
              value={slug}
              onChange={handleSlugChange}
              className="flex-1 px-3.5 py-2.5 bg-transparent text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none text-sm font-mono"
            />
            <div className="pr-3 flex items-center">
              {slugStatus === "checking" && (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              )}
              {slugStatus === "available" && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              )}
              {(slugStatus === "unavailable" || slugStatus === "invalid") && (
                <AlertCircle className="w-4 h-4 text-rose-500" />
              )}
            </div>
          </div>

          {/* Feedback badge */}
          {slugFeedback && (
            <p
              className={`text-xs flex items-center gap-1.5 transition-colors ${
                slugStatus === "available"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : slugStatus === "checking"
                  ? "text-slate-500 dark:text-zinc-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              <span>{slugFeedback}</span>
            </p>
          )}
        </div>

        {/* Brand Color Palette */}
        <div className="space-y-2.5">
          <label className="block text-sm font-medium text-slate-900 dark:text-zinc-100">
            Brand Accent Color
          </label>
          <div className="flex items-center gap-2.5 flex-wrap">
            {BRAND_PALETTES.map((palette) => (
              <button
                key={palette.value}
                type="button"
                onClick={() => setBrandColor(palette.value)}
                className={`relative w-8 h-8 rounded-full transition-transform focus:outline-none ${
                  brandColor === palette.value
                    ? "scale-110 ring-2 ring-offset-2 ring-slate-900 dark:ring-zinc-100 dark:ring-offset-zinc-900"
                    : "hover:scale-105"
                }`}
                style={{ backgroundColor: palette.value }}
                title={palette.name}
                aria-label={`Select ${palette.name} theme`}
              />
            ))}
          </div>
        </div>

        {/* Live Preview Card */}
        <div className="p-4 rounded-lg border border-slate-200/80 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/60 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              Live Shell Preview
            </span>
            <span className="font-mono">
              /w/{slug || "your-slug"}
            </span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-sm"
              style={{ backgroundColor: brandColor }}
            >
              {name ? name.charAt(0).toUpperCase() : "A"}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                {name || "Your Workspace"}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Feedback & Public Roadmap
              </p>
            </div>
          </div>
        </div>

        {/* Error notification */}
        {submitError && (
          <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isPending || slugStatus !== "available"}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-105 active:scale-[0.99]"
          style={{ backgroundColor: brandColor }}
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Provisioning Workspace...
            </>
          ) : (
            <>
              Create Workspace
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
