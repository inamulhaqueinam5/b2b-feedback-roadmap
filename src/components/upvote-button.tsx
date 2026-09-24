"use client";

import { useState, useOptimistic, useTransition, useEffect } from "react";
import { ChevronUp, AlertCircle, X } from "lucide-react";
import { toggleUpvoteAction } from "@/actions/upvotes";
import { queueUpvoteIntent, type QueuedIntent } from "@/lib/intent-capture";
import { AuthModal } from "@/components/auth-modal";

interface UpvoteState {
  count: number;
  hasUpvoted: boolean;
}

export interface UpvoteButtonProps {
  postId: string;
  workspaceSlug: string;
  workspaceId?: string;
  initialUpvoteCount: number;
  initialHasUpvoted?: boolean;
  currentUser?: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
  size?: "sm" | "md" | "lg";
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
  className?: string;
  onUpvoteChange?: (hasUpvoted: boolean, newCount: number) => void;
}

export function UpvoteButton({
  postId,
  workspaceSlug,
  workspaceId,
  initialUpvoteCount,
  initialHasUpvoted = false,
  currentUser,
  size = "md",
  orientation = "vertical",
  disabled = false,
  className = "",
  onUpvoteChange,
}: UpvoteButtonProps) {
  const [state, setState] = useState<UpvoteState>({
    count: Math.max(0, initialUpvoteCount),
    hasUpvoted: initialHasUpvoted,
  });

  const [isPending, startTransition] = useTransition();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localUser, setLocalUser] = useState(currentUser);

  // Sync state if initial props change
  useEffect(() => {
    setState({
      count: Math.max(0, initialUpvoteCount),
      hasUpvoted: initialHasUpvoted,
    });
  }, [initialUpvoteCount, initialHasUpvoted]);

  // Sync user if currentUser prop updates
  useEffect(() => {
    if (currentUser) {
      setLocalUser(currentUser);
    }
  }, [currentUser]);

  // Auto-dismiss error toast
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // React 19 Optimistic state for instant sub-50ms feedback
  const [optimisticState, setOptimisticState] = useOptimistic(
    state,
    (prev: UpvoteState, willUpvote: boolean) => ({
      count: willUpvote ? prev.count + 1 : Math.max(0, prev.count - 1),
      hasUpvoted: willUpvote,
    })
  );

  const effectiveWorkspaceTarget = workspaceId || workspaceSlug;

  async function performToggle() {
    const nextHasUpvoted = !optimisticState.hasUpvoted;

    startTransition(async () => {
      // 1. Instant optimistic state flip (sub-50ms)
      setOptimisticState(nextHasUpvoted);
      setErrorMessage(null);

      try {
        const res = await toggleUpvoteAction(effectiveWorkspaceTarget, postId);

        if (res.success) {
          // Confirmed server state
          setState({
            count: res.upvoteCount,
            hasUpvoted: res.hasUpvoted,
          });
          if (onUpvoteChange) {
            onUpvoteChange(res.hasUpvoted, res.upvoteCount);
          }
        } else {
          // Server rejected mutation: optimistic state reverts automatically
          setErrorMessage(res.error);
          if (res.code === "UNAUTHENTICATED") {
            queueUpvoteIntent(postId, workspaceSlug);
            setIsAuthModalOpen(true);
          }
        }
      } catch {
        setErrorMessage("Network error while submitting upvote. Please try again.");
      }
    });
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    // Unauthenticated visitor intent capture
    if (!currentUser?.id && !localUser?.id) {
      queueUpvoteIntent(postId, workspaceSlug);
      setIsAuthModalOpen(true);
      return;
    }

    performToggle();
  }

  async function handleIntentReplay(intent: QueuedIntent): Promise<boolean> {
    if (intent.type === "upvote") {
      const payload = intent.payload as { postId: string };
      if (payload.postId === postId) {
        await performToggle();
        return true;
      }
    }
    return false;
  }

  function handleAuthSuccess(user: { id: string; email: string; name?: string | null }) {
    setLocalUser(user);
    performToggle();
  }

  // Size styling tokens
  const sizeClasses = {
    sm: orientation === "vertical" ? "w-11 py-1 px-1 text-[11px]" : "py-1 px-2 text-[11px] gap-1",
    md: orientation === "vertical" ? "w-12 py-1.5 px-1.5 text-xs" : "py-1.5 px-2.5 text-xs gap-1.5",
    lg: orientation === "vertical" ? "w-14 py-2 px-2 text-sm" : "py-2 px-3 text-sm gap-2",
  }[size];

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  }[size];

  // Micro-interaction styling classes
  const activeClasses = optimisticState.hasUpvoted
    ? "bg-sky-50 dark:bg-sky-950/50 border-sky-300 dark:border-sky-700 text-sky-600 dark:text-sky-400 font-semibold shadow-xs ring-1 ring-sky-400/20"
    : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/60";

  const orientationClasses =
    orientation === "vertical"
      ? "flex flex-col items-center justify-center rounded-xl"
      : "inline-flex items-center justify-center rounded-lg";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={optimisticState.hasUpvoted ? "Remove upvote" : "Upvote post"}
        aria-pressed={optimisticState.hasUpvoted}
        data-state={optimisticState.hasUpvoted ? "upvoted" : "unvoted"}
        className={`group border select-none transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${orientationClasses} ${sizeClasses} ${activeClasses} ${className}`}
      >
        <ChevronUp
          className={`${iconSizes} shrink-0 transition-transform ${
            optimisticState.hasUpvoted
              ? "stroke-[2.5] text-sky-600 dark:text-sky-400"
              : "stroke-[2] text-slate-400 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-200 group-hover:-translate-y-0.5"
          }`}
        />
        <span
          className={`font-semibold tabular-nums leading-none ${
            optimisticState.hasUpvoted
              ? "text-sky-700 dark:text-sky-300"
              : "text-slate-800 dark:text-zinc-200"
          }`}
        >
          {optimisticState.count}
        </span>
      </button>

      {/* Floating Error Toast */}
      {errorMessage && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/90 border border-rose-200 dark:border-rose-900 text-xs font-medium text-rose-800 dark:text-rose-200 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setErrorMessage(null);
            }}
            className="ml-1 p-0.5 text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 rounded"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Auth Modal for Unauthenticated Intent Capture */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onIntentReplay={handleIntentReplay}
        onSuccess={handleAuthSuccess}
        title="Sign in to upvote"
        description="Cast your vote and stay informed as this feature progresses on the public roadmap."
        intentMessage="Your upvote is saved and will be cast automatically after sign-in."
      />
    </>
  );
}
