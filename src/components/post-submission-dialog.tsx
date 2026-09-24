"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Sparkles,
  Loader2,
  AlertCircle,
  ExternalLink,
  Layers,
  ThumbsUp,
  MessageSquare,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { createPostAction, searchDuplicatesAction } from "@/actions/posts";
import { queueCreatePostIntent, type CreatePostIntentPayload, type QueuedIntent } from "@/lib/intent-capture";
import { AuthModal } from "@/components/auth-modal";
import type { Post } from "@/db/schema/posts";
import type { SimilarPost } from "@/db/repositories/posts";

export interface PostSubmissionDialogProps {
  workspaceSlug: string;
  boards: Array<{
    id: string;
    name: string;
    slug: string;
    isPrivate?: boolean;
    icon?: string;
  }>;
  defaultBoardId?: string;
  currentUser?: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
  } | null;
  isOpen?: boolean;
  onClose?: () => void;
  onPostCreated?: (post: Post) => void;
  triggerButton?: React.ReactNode;
}

export function PostSubmissionDialog({
  workspaceSlug,
  boards,
  defaultBoardId,
  currentUser,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  onPostCreated,
  triggerButton,
}: PostSubmissionDialogProps) {
  const router = useRouter();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = typeof controlledIsOpen === "boolean";
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState(
    defaultBoardId ?? boards[0]?.id ?? ""
  );
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<SimilarPost[]>([]);
  const [isSearchingDuplicates, setIsSearchingDuplicates] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync selected board if defaultBoardId changes
  useEffect(() => {
    if (defaultBoardId) {
      setSelectedBoardId(defaultBoardId);
    } else if (boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id);
    }
  }, [defaultBoardId, boards, selectedBoardId]);

  function handleOpen() {
    if (isControlled) {
      // controlled by parent
    } else {
      setInternalIsOpen(true);
    }
    setErrorMessage(null);
  }

  function handleClose() {
    if (isControlled && controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
    setTitle("");
    setDescription("");
    setDuplicateSuggestions([]);
    setErrorMessage(null);
  }

  // Real-time debounced duplicate search while typing title
  useEffect(() => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setDuplicateSuggestions([]);
      setIsSearchingDuplicates(false);
      return;
    }

    setIsSearchingDuplicates(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchDuplicatesAction(
          workspaceSlug,
          trimmedTitle,
          selectedBoardId || undefined
        );
        if (res.success) {
          setDuplicateSuggestions(res.posts);
        }
      } catch {
        // graceful silence on network fluctuation during typing
      } finally {
        setIsSearchingDuplicates(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [title, selectedBoardId, workspaceSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const cleanTitle = title.trim();
    const cleanDesc = description.trim();

    if (cleanTitle.length < 5) {
      setErrorMessage("Title must be at least 5 characters long");
      return;
    }

    if (cleanDesc.length < 20) {
      setErrorMessage("Description must be at least 20 characters long");
      return;
    }

    if (!selectedBoardId) {
      setErrorMessage("Please select a target board for your feedback");
      return;
    }

    // Intent capture for unauthenticated visitors
    if (!currentUser) {
      const targetBoard = boards.find((b) => b.id === selectedBoardId);
      queueCreatePostIntent({
        workspaceSlug,
        boardSlug: targetBoard?.slug ?? "",
        title: cleanTitle,
        description: cleanDesc,
      });
      setIsAuthModalOpen(true);
      return;
    }

    // Authenticated submission
    setIsSubmitting(true);
    try {
      const res = await createPostAction(workspaceSlug, {
        title: cleanTitle,
        description: cleanDesc,
        boardId: selectedBoardId,
      });

      if (!res.success) {
        setErrorMessage(res.error);
        return;
      }

      handleClose();
      if (onPostCreated) {
        onPostCreated(res.post);
      }
      router.refresh();
    } catch {
      setErrorMessage("An unexpected error occurred while submitting feedback");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleIntentReplay(intent: QueuedIntent): Promise<boolean> {
    if (intent.type === "create_post") {
      const payload = intent.payload as CreatePostIntentPayload;
      const res = await createPostAction(workspaceSlug, {
        title: payload.title,
        description: payload.description,
        boardSlug: payload.boardSlug,
      });

      if (res.success) {
        handleClose();
        setIsAuthModalOpen(false);
        if (onPostCreated) {
          onPostCreated(res.post);
        }
        router.refresh();
        return true;
      } else {
        setErrorMessage(res.error);
        return false;
      }
    }
    return false;
  }

  function handleSelectSuggestion(post: SimilarPost) {
    handleClose();
    router.push(`/w/${workspaceSlug}/p/${post.id}`);
  }

  return (
    <>
      {!isControlled && (
        triggerButton ? (
          <div onClick={handleOpen}>{triggerButton}</div>
        ) : (
          <button
            type="button"
            onClick={handleOpen}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Submit Feedback</span>
          </button>
        )
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submission-modal-title"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2
                    id="submission-modal-title"
                    className="text-sm font-semibold text-slate-900 dark:text-zinc-100"
                  >
                    Submit Feedback
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Share an idea, request or improvement for the product roadmap
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Board Selector */}
              <div className="space-y-1.5">
                <label
                  htmlFor="board-select"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                >
                  Target Board
                </label>
                <select
                  id="board-select"
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-zinc-200 transition-colors"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.isPrivate ? "(Private)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title Input with Duplicate Detection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="feedback-title"
                    className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                  >
                    Title
                  </label>
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                    {title.length}/255
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="feedback-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Short, descriptive summary (min 5 chars)..."
                    maxLength={255}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-zinc-200 transition-colors"
                  />
                  {isSearchingDuplicates && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>

                {/* Duplicate Suggestions Panel */}
                {duplicateSuggestions.length > 0 && (
                  <div className="mt-2.5 p-3 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        Similar suggestions already exist ({duplicateSuggestions.length}):
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {duplicateSuggestions.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => handleSelectSuggestion(post)}
                          className="group flex items-center justify-between gap-3 p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 hover:bg-white dark:hover:bg-zinc-900 border border-amber-200/40 dark:border-amber-900/30 text-xs cursor-pointer transition-all shadow-xs"
                          title="Click to view existing request"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="font-semibold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                              {post.title}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-zinc-400">
                              {post.boardName && <span>in {post.boardName}</span>}
                              <span>•</span>
                              <span className="uppercase tracking-wider font-medium text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                                {post.status.replace("_", " ")}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                              <ThumbsUp className="w-2.5 h-2.5" />
                              {post.upvoteCount}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                      Upvoting an existing request helps prioritize it faster than submitting a duplicate.
                    </p>
                  </div>
                )}
              </div>

              {/* Description Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="feedback-description"
                    className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                  >
                    Description
                  </label>
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                    {description.length >= 20 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {description.length} chars
                      </span>
                    ) : (
                      <span>{description.length}/20 min</span>
                    )}
                  </span>
                </div>
                <textarea
                  id="feedback-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain what you need, your use case and how this solves your problem (min 20 chars)..."
                  rows={5}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-zinc-200 transition-colors resize-y min-h-[100px]"
                />
              </div>

              {/* Unauthenticated User Notice */}
              {!currentUser && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-400 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>
                    You will be prompted to sign in with email or OAuth upon submission. Your draft is automatically preserved.
                  </span>
                </div>
              )}

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || title.trim().length < 5 || description.trim().length < 20}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Submit Feedback</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal for Intent Replay */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onIntentReplay={handleIntentReplay}
        title="Sign in to submit your feedback"
        description="Verify your identity to cast your vote and subscribe to updates on this feature request."
        intentMessage="Your feedback draft is saved and will be published automatically once verified."
      />
    </>
  );
}
