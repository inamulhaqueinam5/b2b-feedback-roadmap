"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  GitMerge,
  Search,
  Check,
  AlertCircle,
  Loader2,
  X,
  ThumbsUp,
  ArrowRight,
} from "lucide-react";
import { searchDuplicatesAction } from "@/actions/posts";
import { mergePostsAction } from "@/actions/merges";
import type { SimilarPost } from "@/db/repositories/posts";

export interface MergePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceSlug: string;
  currentPost: {
    id: string;
    title: string;
  };
  onSuccess?: (masterPostId: string) => void;
}

export function MergePostModal({
  isOpen,
  onClose,
  workspaceId,
  workspaceSlug,
  currentPost,
  onSuccess,
}: MergePostModalProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SimilarPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<SimilarPost | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens and reset state
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedPost(null);
      setErrorMessage(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle escape key and click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (
        modalRef.current &&
        !modalRef.current.contains(e.target as Node) &&
        !isPending
      ) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, isPending, onClose]);

  // Debounced search for candidate master posts
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await searchDuplicatesAction(workspaceSlug, trimmed);
        if (result.success) {
          // Filter out current post and any already-merged post
          const filtered = result.posts.filter(
            (p) => p.id !== currentPost.id && !p.mergedIntoPostId
          );
          setSearchResults(filtered);
        }
      } catch {
        // Search error handling
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, workspaceSlug, currentPost.id]);

  if (!isOpen) return null;

  function handleConfirmMerge() {
    if (!selectedPost) return;

    setErrorMessage(null);
    startTransition(async () => {
      const result = await mergePostsAction(
        workspaceId,
        currentPost.id,
        selectedPost.id
      );

      if (result.success) {
        onSuccess?.(selectedPost.id);
        onClose();
        router.push(`/w/${workspaceSlug}/p/${selectedPost.id}`);
        router.refresh();
      } else {
        setErrorMessage(result.error);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <GitMerge className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="merge-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-zinc-100"
              >
                Merge Duplicate Post
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Consolidate feedback into a canonical master post
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {/* Current Post Notice */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50 text-xs">
            <span className="font-semibold text-slate-500 dark:text-zinc-400">
              Secondary post to merge:
            </span>
            <div className="mt-1 font-medium text-slate-900 dark:text-zinc-100 truncate">
              {currentPost.title}
            </div>
          </div>

          {/* Search Bar for Master Post */}
          <div className="space-y-1.5">
            <label
              htmlFor="master-post-search"
              className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 uppercase tracking-wider"
            >
              Select Target Master Post
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={inputRef}
                id="master-post-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search target master post by title..."
                disabled={isPending}
                className="w-full pl-9 pr-9 py-2 rounded-xl text-xs border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500 transition-all disabled:opacity-60"
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          {/* Search Results List */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {searchQuery.trim().length >= 2 &&
              searchResults.length === 0 &&
              !isSearching && (
                <div className="text-center py-6 text-xs text-slate-500 dark:text-zinc-400">
                  No matching posts found. Try a different title keyword.
                </div>
              )}

            {searchResults.map((candidate) => {
              const isSelected = selectedPost?.id === candidate.id;

              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedPost(candidate)}
                  className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? "border-sky-500 bg-sky-50/60 dark:bg-sky-950/30 text-sky-900 dark:text-sky-200 ring-1 ring-sky-500"
                      : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800/40 text-slate-800 dark:text-zinc-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{candidate.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 flex-wrap">
                      {candidate.boardName && (
                        <span>Board: {candidate.boardName}</span>
                      )}
                      <span>•</span>
                      <span className="capitalize">{candidate.status}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                      <ThumbsUp className="w-3 h-3 text-slate-400" />
                      <span>{candidate.upvoteCount}</span>
                    </div>

                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Confirmation Banner */}
          {selectedPost && (
            <div className="p-3.5 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/80 dark:bg-sky-950/40 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-sky-800 dark:text-sky-300">
                <GitMerge className="w-3.5 h-3.5" />
                <span>Ready to merge into:</span>
              </div>
              <p className="font-medium text-slate-900 dark:text-zinc-100 truncate">
                {selectedPost.title}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-normal">
                This action will mark the secondary post closed, transfer all unique upvotes and subscribers to the master post and insert audit records in both discussion threads.
              </p>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmMerge}
            disabled={!selectedPost || isPending}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Merging Posts...</span>
              </>
            ) : (
              <>
                <GitMerge className="w-3.5 h-3.5" />
                <span>Confirm Merge</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface MergePostButtonProps {
  workspaceId: string;
  workspaceSlug: string;
  post: {
    id: string;
    title: string;
  };
  canMerge: boolean;
  className?: string;
}

export function MergePostButton({
  workspaceId,
  workspaceSlug,
  post,
  canMerge,
  className = "",
}: MergePostButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!canMerge) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors shadow-2xs cursor-pointer select-none ${className}`}
        title="Merge this duplicate post into a master post"
      >
        <GitMerge className="w-3 h-3 text-slate-500 dark:text-zinc-400" />
        <span>Merge</span>
      </button>

      <MergePostModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        currentPost={post}
      />
    </>
  );
}
