"use client";

import { useState, useOptimistic, useTransition, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Edit3,
  Trash2,
  Check,
  X,
  Clock,
  History,
  ArrowRight,
} from "lucide-react";
import {
  createCommentAction,
  updateCommentAction,
  deleteCommentAction,
  type CommentItem,
} from "@/actions/comments";
import {
  queueCommentIntent,
  type CreateCommentIntentPayload,
  type QueuedIntent,
} from "@/lib/intent-capture";
import { AuthModal } from "@/components/auth-modal";
import { isWithinCommentEditWindow } from "@/services/comments";

export interface CommentThreadProps {
  workspaceId: string;
  workspaceSlug: string;
  postId: string;
  initialComments: CommentItem[];
  currentUser?: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
    role?: string;
  } | null;
}

type OptimisticAction =
  | { type: "add"; comment: CommentItem }
  | { type: "update"; commentId: string; content: string }
  | { type: "delete"; commentId: string };

function formatRelativeTime(date: Date | string | number): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

function getInitials(name?: string | null, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "U";
}

export function CommentThread({
  workspaceId,
  workspaceSlug,
  postId,
  initialComments,
  currentUser,
}: CommentThreadProps) {
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [newContent, setNewContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Inline editing state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Deletion pending state
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Sync initial comments if updated externally
  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  // React 19 Optimistic state
  const [optimisticComments, dispatchOptimistic] = useOptimistic(
    comments,
    (state: CommentItem[], action: OptimisticAction) => {
      switch (action.type) {
        case "add":
          return [...state, action.comment];
        case "update":
          return state.map((c) =>
            c.id === action.commentId
              ? { ...c, content: action.content, updatedAt: new Date() }
              : c
          );
        case "delete":
          return state.filter((c) => c.id !== action.commentId);
        default:
          return state;
      }
    }
  );

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = newContent.trim();
    if (!trimmed) {
      setErrorMessage("Comment content cannot be empty");
      return;
    }

    if (trimmed.length > 5000) {
      setErrorMessage("Comment content cannot exceed 5000 characters");
      return;
    }

    // Unauthenticated intent capture
    if (!currentUser) {
      queueCommentIntent({
        postId,
        content: trimmed,
        workspaceSlug,
      });
      setIsAuthModalOpen(true);
      return;
    }

    const optimisticId = `temp_${Date.now()}`;
    const optimisticItem: CommentItem = {
      id: optimisticId,
      postId,
      authorId: currentUser.id,
      content: trimmed,
      isInternalNote: false,
      isSystemAudit: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        id: currentUser.id,
        name: currentUser.name ?? null,
        email: currentUser.email,
        image: currentUser.image ?? null,
      },
      isTeamMember:
        currentUser.role === "owner" || currentUser.role === "admin",
      authorRole: currentUser.role ?? null,
      canEdit: true,
      canDelete: true,
    };

    startTransition(async () => {
      dispatchOptimistic({ type: "add", comment: optimisticItem });
      setNewContent("");

      const result = await createCommentAction(workspaceId, postId, trimmed);
      if (result.success) {
        setComments((prev) => [...prev, result.comment]);
      } else {
        setErrorMessage(result.error);
        setNewContent(trimmed);
      }
    });
  }

  function handleStartEdit(comment: CommentItem) {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
    setEditError(null);
  }

  function handleCancelEdit() {
    setEditingCommentId(null);
    setEditContent("");
    setEditError(null);
  }

  async function handleSaveEdit(commentId: string) {
    setEditError(null);
    const trimmed = editContent.trim();

    if (!trimmed) {
      setEditError("Comment cannot be empty");
      return;
    }

    if (trimmed.length > 5000) {
      setEditError("Comment cannot exceed 5000 characters");
      return;
    }

    startTransition(async () => {
      dispatchOptimistic({ type: "update", commentId, content: trimmed });
      setEditingCommentId(null);

      const result = await updateCommentAction(workspaceId, commentId, trimmed);
      if (result.success) {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? result.comment : c))
        );
      } else {
        setErrorMessage(result.error);
        setEditingCommentId(commentId);
        setEditError(result.error);
      }
    });
  }

  async function handleDeleteComment(commentId: string) {
    setErrorMessage(null);
    setDeletingCommentId(commentId);

    startTransition(async () => {
      dispatchOptimistic({ type: "delete", commentId });

      const result = await deleteCommentAction(workspaceId, commentId);
      if (result.success) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } else {
        setErrorMessage(result.error);
      }
      setDeletingCommentId(null);
    });
  }

  async function handleIntentReplay(intent: QueuedIntent): Promise<boolean> {
    if (intent.type === "create_comment") {
      const payload = intent.payload as CreateCommentIntentPayload;
      const res = await createCommentAction(
        workspaceId,
        payload.postId,
        payload.content
      );
      if (res.success) {
        setComments((prev) => [...prev, res.comment]);
        setNewContent("");
        setIsAuthModalOpen(false);
        return true;
      } else {
        setErrorMessage(res.error);
        return false;
      }
    }
    return false;
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
            Discussion
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
            {optimisticComments.length}
          </span>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Comment Submission Form */}
      <form onSubmit={handleSubmitComment} className="space-y-3">
        <div className="relative">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Share your thoughts, ask a question or leave feedback..."
            rows={3}
            maxLength={5000}
            disabled={isPending}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-zinc-200 transition-colors resize-y min-h-[80px]"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            {newContent.length > 0 && `${newContent.length}/5000 chars`}
          </span>

          <button
            type="submit"
            disabled={isPending || newContent.trim().length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Posting...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Post comment</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-4">
        {optimisticComments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 p-8 text-center space-y-2 bg-slate-50/40 dark:bg-zinc-900/20">
            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300">
              No comments yet
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Be the first to share your thoughts, feedback or questions.
            </p>
          </div>
        ) : (
          optimisticComments.map((comment) => {
            if (comment.isSystemAudit) {
              const match = comment.content.match(/^Changed status from (.+) to (.+)$/);
              const fromStatus = match ? match[1] : null;
              const toStatus = match ? match[2] : null;

              return (
                <div
                  key={comment.id}
                  className="flex items-center gap-3 py-2.5 px-4 rounded-xl bg-slate-50/80 dark:bg-zinc-900/50 border border-slate-200/80 dark:border-zinc-800/80 text-xs text-slate-600 dark:text-zinc-400 transition-colors shadow-2xs"
                >
                  <div className="w-6 h-6 rounded-full bg-slate-200/70 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-zinc-400 border border-slate-300/60 dark:border-zinc-700">
                    <History className="w-3 h-3" />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    <span className="font-semibold text-slate-900 dark:text-zinc-100">
                      {comment.author.name ?? comment.author.email}
                    </span>

                    {fromStatus && toStatus ? (
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span>changed status from</span>
                        <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-300/60 dark:border-zinc-700">
                          {fromStatus}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                        <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                          {toStatus}
                        </span>
                      </span>
                    ) : (
                      <span>{comment.content}</span>
                    )}
                  </div>

                  <span
                    className="text-[11px] text-slate-400 dark:text-zinc-500 shrink-0 flex items-center gap-1 font-mono"
                    title={new Date(comment.createdAt).toLocaleString()}
                  >
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                </div>
              );
            }

            const isEditing = editingCommentId === comment.id;
            const isDeleting = deletingCommentId === comment.id;

            const isAuthor = Boolean(
              currentUser?.id && currentUser.id === comment.authorId
            );
            const isWorkspaceAdmin =
              currentUser?.role === "owner" || currentUser?.role === "admin";
            const within15Mins = isWithinCommentEditWindow(comment.createdAt);

            const canEdit =
              comment.canEdit || isWorkspaceAdmin || (isAuthor && within15Mins);
            const canDelete =
              comment.canDelete || isWorkspaceAdmin || (isAuthor && within15Mins);

            return (
              <div
                key={comment.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs space-y-3 transition-colors"
              >
                {/* Comment Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {/* Author Avatar */}
                    {comment.author.image ? (
                      <img
                        src={comment.author.image}
                        alt={comment.author.name ?? "User"}
                        className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-zinc-700"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-medium text-[11px] flex items-center justify-center border border-slate-200 dark:border-zinc-700">
                        {getInitials(comment.author.name, comment.author.email)}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                        {comment.author.name ?? comment.author.email}
                      </span>

                      {/* Team Badge */}
                      {comment.isTeamMember && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                          <ShieldCheck className="w-3 h-3 text-sky-500" />
                          Team
                        </span>
                      )}

                      <span className="text-slate-300 dark:text-zinc-700 text-xs">
                        •
                      </span>

                      <span
                        className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1"
                        title={new Date(comment.createdAt).toLocaleString()}
                      >
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Edit & Delete buttons */}
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(comment)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Edit comment"
                          aria-label="Edit comment"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Delete comment"
                          aria-label="Delete comment"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Comment Body / Inline Edit Mode */}
                {isEditing ? (
                  <div className="space-y-2 pt-1">
                    {editError && (
                      <div className="text-[11px] text-rose-600 dark:text-rose-400">
                        {editError}
                      </div>
                    )}
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      maxLength={5000}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-zinc-200 transition-colors resize-y"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                        {isAuthor && !isWorkspaceAdmin && (
                          <span>Editable within 15 mins of posting</span>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <X className="w-3 h-3" />
                          <span>Cancel</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(comment.id)}
                          disabled={editContent.trim().length === 0}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs sm:text-sm text-slate-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {comment.content}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Auth Modal for Intent Replay */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onIntentReplay={handleIntentReplay}
        title="Sign in to post a comment"
        description="Join the discussion, collaborate with the team and track this feature request."
        intentMessage="Your comment draft is preserved and will be published automatically once verified."
      />
    </div>
  );
}
