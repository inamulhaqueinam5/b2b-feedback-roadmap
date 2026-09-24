"use client";

import { useState } from "react";
import { MessageSquare, Lock } from "lucide-react";
import { CommentThread } from "@/components/comment-thread";
import { InternalNotesThread } from "@/components/internal-notes-thread";
import type { CommentItem } from "@/actions/comments";

export interface PostDetailTabsProps {
  workspaceId: string;
  workspaceSlug: string;
  postId: string;
  initialComments: CommentItem[];
  initialNotes: CommentItem[];
  currentUser?: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
    role?: string;
  } | null;
  isAdmin: boolean;
}

export function PostDetailTabs({
  workspaceId,
  workspaceSlug,
  postId,
  initialComments,
  initialNotes,
  currentUser,
  isAdmin,
}: PostDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<"discussion" | "notes">("discussion");

  // Non-admins only have access to the public discussion stream
  if (!isAdmin) {
    return (
      <CommentThread
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        postId={postId}
        initialComments={initialComments}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Switcher Bar for Admins */}
      <div className="border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          {/* Discussion Tab */}
          <button
            type="button"
            onClick={() => setActiveTab("discussion")}
            className={`pb-3 inline-flex items-center gap-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "discussion"
                ? "border-slate-900 dark:border-zinc-100 text-slate-900 dark:text-zinc-100"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Discussion</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                activeTab === "discussion"
                  ? "bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100"
                  : "bg-slate-50 dark:bg-zinc-800/60 text-slate-500 dark:text-zinc-400"
              }`}
            >
              {initialComments.length}
            </span>
          </button>

          {/* Internal Notes Tab with Confidential Badge Indicator */}
          <button
            type="button"
            onClick={() => setActiveTab("notes")}
            className={`pb-3 inline-flex items-center gap-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "notes"
                ? "border-amber-500 dark:border-amber-400 text-amber-900 dark:text-amber-200"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Lock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span>Internal Notes</span>

            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              <Lock className="w-2.5 h-2.5" />
              Confidential
            </span>

            {initialNotes.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                {initialNotes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === "discussion" ? (
        <CommentThread
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          postId={postId}
          initialComments={initialComments}
          currentUser={currentUser}
        />
      ) : (
        <InternalNotesThread
          workspaceId={workspaceId}
          postId={postId}
          initialNotes={initialNotes}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
