import { notFound } from "next/navigation";
import Link from "next/link";
import { getBoardBySlugAction } from "@/actions/boards";
import { BoardIcon } from "@/components/board-icon";
import {
  Globe,
  Lock,
  ArrowLeft,
  Search,
  SlidersHorizontal,
  Plus,
  MessageSquareDashed,
  Sparkles,
} from "lucide-react";

interface BoardPageProps {
  params: Promise<{
    workspaceSlug: string;
    boardSlug: string;
  }>;
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { workspaceSlug, boardSlug } = await params;
  const result = await getBoardBySlugAction(workspaceSlug, boardSlug);

  if (!result.success || !result.board) {
    notFound();
  }

  const { board, workspace } = result;

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
        <Link
          href={`/w/${workspace.slug}`}
          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{workspace.name}</span>
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-zinc-100 font-semibold">{board.name}</span>
      </nav>

      {/* Board Header Surface */}
      <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm relative overflow-hidden">
        <div
          className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ backgroundColor: workspace.brandColor }}
        />

        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
              style={{ backgroundColor: workspace.brandColor }}
            >
              <BoardIcon name={board.icon} className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                  {board.name}
                </h1>
                {board.isPrivate ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                    <Lock className="w-3 h-3" />
                    Private Board
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    <Globe className="w-3 h-3" />
                    Public Board
                  </span>
                )}
              </div>

              {board.description ? (
                <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                  {board.description}
                </p>
              ) : (
                <p className="text-sm text-slate-400 dark:text-zinc-500 italic">
                  No board description provided
                </p>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-all"
              style={{ backgroundColor: workspace.brandColor }}
            >
              <Plus className="w-4 h-4" />
              Submit Feedback
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search feedback..."
            disabled
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 cursor-not-allowed opacity-75"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end text-xs font-medium">
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-0.5 shadow-sm">
            <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 font-semibold">
              Trending
            </span>
            <span className="px-3 py-1.5 text-slate-500 dark:text-zinc-400 cursor-not-allowed">
              Top Voted
            </span>
            <span className="px-3 py-1.5 text-slate-500 dark:text-zinc-400 cursor-not-allowed">
              Newest
            </span>
          </div>
        </div>
      </div>

      {/* Posts Empty State */}
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 p-10 sm:p-14 text-center space-y-4 bg-white/50 dark:bg-zinc-900/20">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-500">
          <MessageSquareDashed className="w-6 h-6" />
        </div>

        <div className="space-y-1 max-w-sm mx-auto">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            No feedback entries on {board.name} yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Be the first community member to propose an idea or submit a request for this board.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Feedback Submissions Coming in Issue #6
          </button>
        </div>
      </div>
    </div>
  );
}
