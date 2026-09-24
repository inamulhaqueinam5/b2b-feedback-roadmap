import { getWorkspaceAction } from "@/actions/workspaces";
import { getBoardsAction } from "@/actions/boards";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BoardIcon } from "@/components/board-icon";
import { BoardManagementDialog } from "@/components/board-management-dialog";
import {
  CheckCircle2,
  Lock,
  Globe,
  ArrowRight,
  FolderKanban,
  Plus,
  Sparkles,
} from "lucide-react";

interface WorkspacePageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceSlug } = await params;
  const [workspaceResult, boardsResult] = await Promise.all([
    getWorkspaceAction(workspaceSlug),
    getBoardsAction(workspaceSlug),
  ]);

  if (!workspaceResult.success || !workspaceResult.workspace) {
    notFound();
  }

  const { workspace } = workspaceResult;
  const boards = boardsResult.success ? boardsResult.boards : [];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm relative overflow-hidden">
        <div
          className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ backgroundColor: workspace.brandColor }}
        />
        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Workspace Active & Provisioned
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
              Welcome to {workspace.name}
            </h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Explore feedback boards below or create new boards to organize user suggestions, bug reports and customer requests.
            </p>
          </div>

          <div className="pt-2 flex items-center gap-3 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-mono text-slate-600 dark:text-zinc-400 flex items-center gap-2">
              <span className="text-slate-400 dark:text-zinc-600">Slug:</span>
              <span className="font-semibold text-slate-900 dark:text-zinc-200">{workspace.slug}</span>
            </div>

            <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs flex items-center gap-2">
              <span className="text-slate-400 dark:text-zinc-600">Brand Color:</span>
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: workspace.brandColor }}
              />
              <span className="font-mono text-slate-600 dark:text-zinc-400">{workspace.brandColor}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Boards Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
              Feedback Boards
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Select a board to submit or review posts
            </p>
          </div>

          <BoardManagementDialog
            workspaceSlug={workspace.slug}
            boards={boards}
            triggerLabel="Configure Boards"
          />
        </div>

        {boards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 p-8 sm:p-12 text-center space-y-4 bg-slate-50/50 dark:bg-zinc-900/20">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-500">
              <FolderKanban className="w-6 h-6" />
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h4 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                No feedback boards configured yet
              </h4>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
                Create your first board to start collecting customer suggestions and bug reports.
              </p>
            </div>

            <div className="pt-2">
              <BoardManagementDialog
                workspaceSlug={workspace.slug}
                boards={boards}
                triggerLabel="Create First Board"
                triggerClassName="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board) => (
              <Link
                key={board.id}
                href={`/w/${workspace.slug}/b/${board.slug}`}
                className="group p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-700 dark:text-zinc-300 group-hover:bg-sky-50 dark:group-hover:bg-sky-950/40 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      <BoardIcon name={board.icon} className="w-5 h-5 text-sky-500" />
                    </div>

                    {board.isPrivate ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                        <Lock className="w-2.5 h-2.5" />
                        Private
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                        <Globe className="w-2.5 h-2.5" />
                        Public
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-zinc-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      {board.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 mt-1">
                      {board.description || "No description provided for this board."}
                    </p>
                  </div>
                </div>

                <div className="pt-4 mt-2 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200">
                  <span className="font-mono text-[11px]">/b/{board.slug}</span>
                  <div className="flex items-center gap-1">
                    <span>View Board</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}

            {/* Quick Create Board Card */}
            <div className="p-5 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/20 flex flex-col items-center justify-center text-center p-6 space-y-3 min-h-[160px]">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400 dark:text-zinc-500">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Add another board
                </p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                  Segment your customer suggestions
                </p>
              </div>
              <BoardManagementDialog
                workspaceSlug={workspace.slug}
                boards={boards}
                triggerLabel="New Board"
                triggerClassName="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
