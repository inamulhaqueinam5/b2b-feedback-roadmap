import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceAction } from "@/actions/workspaces";
import { getBoardsAction } from "@/actions/boards";
import { ThemeToggle } from "@/components/theme-toggle";
import { BoardNavigationPills } from "@/components/board-navigation-pills";
import { BoardManagementDialog } from "@/components/board-management-dialog";
import { NotificationDropdown } from "@/components/notification-dropdown";
import { PlusCircle } from "lucide-react";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      {/* Workspace Header Shell */}
      <header className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between">
            {/* Left: Branding */}
            <div className="flex items-center gap-3">
              <Link
                href={`/w/${workspace.slug}`}
                className="flex items-center gap-3 group"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-sm group-hover:scale-105 transition-transform"
                  style={{ backgroundColor: workspace.brandColor }}
                >
                  {workspace.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-semibold text-slate-900 dark:text-zinc-50 leading-tight group-hover:text-sky-500 transition-colors">
                      {workspace.name}
                    </h1>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                      /w/{workspace.slug}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Feedback & Roadmap Community
                  </p>
                </div>
              </Link>
            </div>

            {/* Right: Actions & Theme Switcher */}
            <div className="flex items-center gap-2">
              <NotificationDropdown workspaceSlug={workspace.slug} />
              <BoardManagementDialog
                workspaceSlug={workspace.slug}
                boards={boards}
              />
              <Link
                href="/"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
                title="Create another workspace"
              >
                <PlusCircle className="w-3.5 h-3.5 text-slate-500" />
                New Workspace
              </Link>
              <ThemeToggle />
            </div>
          </div>

          {/* Dynamic Navigation Bar with Boards */}
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/60 pt-0.5">
            <BoardNavigationPills
              workspaceSlug={workspace.slug}
              boards={boards}
            />
          </div>
        </div>
      </header>

      {/* Main Tenant Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
