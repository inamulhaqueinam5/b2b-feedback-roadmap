"use client";

import { useState, useOptimistic, useTransition, useEffect } from "react";
import {
  Lock,
  Send,
  Loader2,
  AlertCircle,
  Clock,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import {
  createInternalNoteAction,
  type CommentItem,
} from "@/actions/internal-notes";
import { deleteCommentAction } from "@/actions/comments";

export interface InternalNotesThreadProps {
  workspaceId: string;
  postId: string;
  initialNotes: CommentItem[];
  currentUser?: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
    role?: string;
  } | null;
}

type OptimisticAction =
  | { type: "add"; note: CommentItem }
  | { type: "delete"; noteId: string };

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
  return "A";
}

export function InternalNotesThread({
  workspaceId,
  postId,
  initialNotes,
  currentUser,
}: InternalNotesThreadProps) {
  const [notes, setNotes] = useState<CommentItem[]>(initialNotes);
  const [newContent, setNewContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const [optimisticNotes, dispatchOptimistic] = useOptimistic(
    notes,
    (state: CommentItem[], action: OptimisticAction) => {
      switch (action.type) {
        case "add":
          return [...state, action.note];
        case "delete":
          return state.filter((n) => n.id !== action.noteId);
        default:
          return state;
      }
    }
  );

  async function handleSubmitNote(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = newContent.trim();
    if (!trimmed) {
      setErrorMessage("Internal note content cannot be empty");
      return;
    }

    if (trimmed.length > 5000) {
      setErrorMessage("Internal note cannot exceed 5000 characters");
      return;
    }

    if (!currentUser) {
      setErrorMessage("Authentication required to post internal notes");
      return;
    }

    const optimisticId = `temp_note_${Date.now()}`;
    const optimisticNote: CommentItem = {
      id: optimisticId,
      postId,
      authorId: currentUser.id,
      content: trimmed,
      isInternalNote: true,
      isSystemAudit: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        id: currentUser.id,
        name: currentUser.name ?? null,
        email: currentUser.email,
        image: currentUser.image ?? null,
      },
      isTeamMember: true,
      authorRole: currentUser.role ?? "admin",
      canEdit: true,
      canDelete: true,
    };

    startTransition(async () => {
      dispatchOptimistic({ type: "add", note: optimisticNote });
      setNewContent("");

      const result = await createInternalNoteAction(
        workspaceId,
        postId,
        trimmed
      );

      if (result.success) {
        setNotes((prev) => [...prev, result.note]);
      } else {
        setErrorMessage(result.error);
        setNewContent(trimmed);
      }
    });
  }

  async function handleDeleteNote(noteId: string) {
    setErrorMessage(null);
    setDeletingNoteId(noteId);

    startTransition(async () => {
      dispatchOptimistic({ type: "delete", noteId });

      const result = await deleteCommentAction(workspaceId, noteId);
      if (result.success) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      } else {
        setErrorMessage(result.error);
      }
      setDeletingNoteId(null);
    });
  }

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold">
            Confidential Internal Notes
          </p>
          <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90">
            Visible only to workspace owners and admins. Never shown to visitors, members or guests.
          </p>
        </div>
      </div>

      {/* Global Error Message */}
      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Internal Note Creation Form */}
      <form onSubmit={handleSubmitNote} className="space-y-3">
        <div className="relative">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write confidential internal discussion, feasibility estimates or customer revenue context..."
            rows={3}
            maxLength={5000}
            disabled={isPending}
            className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-amber-700/50 dark:placeholder:text-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400 transition-colors resize-y min-h-[80px]"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            {newContent.length > 0 && `${newContent.length}/5000 chars`}
          </span>

          <button
            type="submit"
            disabled={isPending || newContent.trim().length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving note...</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Save internal note</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Notes Listing */}
      <div className="space-y-3">
        {optimisticNotes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-200 dark:border-amber-900/60 p-8 text-center space-y-2 bg-amber-50/20 dark:bg-amber-950/10">
            <Lock className="w-6 h-6 text-amber-500/70 mx-auto" />
            <p className="text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-200">
              No internal notes yet
            </p>
            <p className="text-xs text-amber-700/70 dark:text-amber-400/70 max-w-sm mx-auto">
              Share private technical feasibility, revenue potential or customer context with your fellow admins.
            </p>
          </div>
        ) : (
          optimisticNotes.map((note) => {
            const isDeleting = deletingNoteId === note.id;

            return (
              <div
                key={note.id}
                className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/10 shadow-xs space-y-3 transition-colors"
              >
                {/* Note Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {note.author.image ? (
                      <img
                        src={note.author.image}
                        alt={note.author.name ?? "User"}
                        className="w-7 h-7 rounded-full object-cover border border-amber-300 dark:border-amber-700"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-medium text-[11px] flex items-center justify-center border border-amber-300 dark:border-amber-700">
                        {getInitials(note.author.name, note.author.email)}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                        {note.author.name ?? note.author.email}
                      </span>

                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        <Lock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                        Private Note
                      </span>

                      <span className="text-slate-300 dark:text-zinc-700 text-xs">
                        •
                      </span>

                      <span
                        className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1"
                        title={new Date(note.createdAt).toLocaleString()}
                      >
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(note.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Delete internal note"
                      aria-label="Delete internal note"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Note Content */}
                <div className="text-xs sm:text-sm text-slate-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {note.content}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
