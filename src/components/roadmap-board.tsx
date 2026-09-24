"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { UpvoteButton } from "@/components/upvote-button";
import { BoardIcon } from "@/components/board-icon";
import {
  Clock,
  Hammer,
  CheckCircle2,
  MessageSquare,
  LayoutGrid,
  Lock,
  Inbox,
} from "lucide-react";
import type { RoadmapData, RoadmapCard } from "@/services/roadmap";
import type { Board } from "@/db/schema/boards";

interface RoadmapBoardProps {
  workspaceSlug: string;
  workspaceId: string;
  boards: Board[];
  initialRoadmap: RoadmapData;
  initialBoardId?: string;
  currentUser?: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
}

interface ColumnConfig {
  key: "planned" | "inProgress" | "completed";
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badgeBg: string;
  emptyTitle: string;
  emptySubtitle: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    key: "planned",
    label: "Planned",
    description: "Scheduled for upcoming development cycles",
    icon: Clock,
    accentColor: "text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300",
    emptyTitle: "No planned items",
    emptySubtitle: "Features prioritized for future releases will appear here.",
  },
  {
    key: "inProgress",
    label: "In Progress",
    description: "Actively being designed, engineered and tested",
    icon: Hammer,
    accentColor: "text-sky-600 dark:text-sky-400",
    badgeBg: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/60 text-sky-700 dark:text-sky-300",
    emptyTitle: "Nothing in progress",
    emptySubtitle: "Features currently under construction will appear here.",
  },
  {
    key: "completed",
    label: "Completed",
    description: "Shipped and released to customers",
    icon: CheckCircle2,
    accentColor: "text-emerald-600 dark:text-emerald-400",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300",
    emptyTitle: "No shipped features",
    emptySubtitle: "Completed suggestions will appear here once released.",
  },
];

export function RoadmapBoard({
  workspaceSlug,
  workspaceId,
  boards,
  initialRoadmap,
  initialBoardId,
  currentUser,
}: RoadmapBoardProps) {
  const [selectedBoardId, setSelectedBoardId] = useState<string>(
    initialBoardId || "all"
  );

  function handleSelectBoard(boardId: string) {
    setSelectedBoardId(boardId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (boardId === "all") {
        url.searchParams.delete("boardId");
      } else {
        url.searchParams.set("boardId", boardId);
      }
      window.history.replaceState(null, "", url.toString());
    }
  }

  // Filter columns based on active board filter
  const filteredColumns = useMemo(() => {
    if (selectedBoardId === "all") {
      return {
        planned: initialRoadmap.columns.planned,
        inProgress: initialRoadmap.columns.inProgress,
        completed: initialRoadmap.columns.completed,
      };
    }

    return {
      planned: initialRoadmap.columns.planned.filter(
        (c) => c.boardId === selectedBoardId
      ),
      inProgress: initialRoadmap.columns.inProgress.filter(
        (c) => c.boardId === selectedBoardId
      ),
      completed: initialRoadmap.columns.completed.filter(
        (c) => c.boardId === selectedBoardId
      ),
    };
  }, [initialRoadmap, selectedBoardId]);

  const totalFilteredCount =
    filteredColumns.planned.length +
    filteredColumns.inProgress.length +
    filteredColumns.completed.length;

  return (
    <div className="space-y-6">
      {/* Board Filter Pills */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleSelectBoard("all")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              selectedBoardId === "all"
                ? "bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-xs"
                : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:border-slate-300 dark:hover:border-zinc-700"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>All Boards</span>
            <span
              className={`text-[10px] tabular-nums font-mono px-1.5 py-0.2 rounded-full ${
                selectedBoardId === "all"
                  ? "bg-slate-700 text-slate-200 dark:bg-zinc-300 dark:text-zinc-800"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
              }`}
            >
              {initialRoadmap.counts.total}
            </span>
          </button>

          {boards.map((b) => {
            const isSelected = selectedBoardId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => handleSelectBoard(b.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? "bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-xs"
                    : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:border-slate-300 dark:hover:border-zinc-700"
                }`}
              >
                <BoardIcon name={b.icon} className="w-3.5 h-3.5 shrink-0" />
                <span>{b.name}</span>
                {b.isPrivate && <Lock className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
          Showing <span className="tabular-nums font-semibold text-slate-800 dark:text-zinc-200">{totalFilteredCount}</span> roadmap items
        </div>
      </div>

      {/* 3-Column Kanban Board Layout */}
      <div className="flex overflow-x-auto md:overflow-visible md:grid md:grid-cols-3 gap-5 sm:gap-6 pb-6 md:pb-0 snap-x snap-mandatory scrollbar-thin">
        {COLUMNS.map((col) => {
          const cards: RoadmapCard[] = filteredColumns[col.key];
          const Icon = col.icon;

          return (
            <div
              key={col.key}
              className="min-w-[290px] w-[84vw] sm:w-[340px] md:w-auto shrink-0 snap-start flex flex-col space-y-3"
            >
              {/* Column Header */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${col.accentColor}`} />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                      {col.label}
                    </h3>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${col.badgeBg}`}
                  >
                    {cards.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1">
                  {col.description}
                </p>
              </div>

              {/* Column Cards */}
              <div className="flex-1 space-y-3 min-h-[200px]">
                {cards.length > 0 ? (
                  cards.map((card) => (
                    <div
                      key={card.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all flex flex-col justify-between gap-3 group relative"
                    >
                      {/* Top Header: Board Tag */}
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/w/${workspaceSlug}/b/${card.boardSlug}`}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
                        >
                          <BoardIcon
                            name="message-square"
                            className="w-3 h-3 text-sky-500 shrink-0"
                          />
                          <span className="truncate max-w-[160px]">
                            {card.boardName}
                          </span>
                        </Link>
                      </div>

                      {/* Title & Description Linking to Detail */}
                      <div className="space-y-1.5">
                        <Link
                          href={`/w/${workspaceSlug}/p/${card.id}`}
                          className="text-sm font-semibold text-slate-900 dark:text-zinc-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors line-clamp-2 leading-snug block"
                        >
                          {card.title}
                        </Link>
                        {card.description && (
                          <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                            {card.description}
                          </p>
                        )}
                      </div>

                      {/* Card Footer: Upvote Button & Comment Count */}
                      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-zinc-800/80">
                        <UpvoteButton
                          postId={card.id}
                          workspaceSlug={workspaceSlug}
                          workspaceId={workspaceId}
                          initialUpvoteCount={card.upvoteCount}
                          initialHasUpvoted={card.hasUpvoted}
                          currentUser={currentUser}
                          size="sm"
                          orientation="horizontal"
                        />

                        <Link
                          href={`/w/${workspaceSlug}/p/${card.id}`}
                          className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors px-1.5 py-1 rounded-md"
                          title="View post and comments"
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-medium tabular-nums">
                            {card.commentCount}
                          </span>
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/80 p-8 text-center space-y-2 bg-slate-50/50 dark:bg-zinc-900/20">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-500">
                      <Inbox className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                      {col.emptyTitle}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-[200px] mx-auto">
                      {col.emptySubtitle}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
