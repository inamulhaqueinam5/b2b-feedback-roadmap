import { getWorkspaceAction } from "@/actions/workspaces";
import { notFound } from "next/navigation";
import { CheckCircle2, Kanban, Sparkles, MessageSquarePlus, Share2 } from "lucide-react";

interface WorkspacePageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceSlug } = await params;
  const result = await getWorkspaceAction(workspaceSlug);

  if (!result.success || !result.workspace) {
    notFound();
  }

  const { workspace } = result;

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm relative overflow-hidden">
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-10 blur-2xl pointer-events-none"
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
            <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-2xl">
              Your feedback workspace foundation is live. Customers and team members can now visit this hub to suggest ideas, participate in discussions and track product progress.
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

      {/* Boards Empty State / Next Steps */}
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-zinc-800 p-8 sm:p-12 text-center space-y-4 bg-slate-50/50 dark:bg-zinc-900/20">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-slate-400 dark:text-zinc-500">
          <Kanban className="w-6 h-6" />
        </div>

        <div className="space-y-1.5 max-w-md mx-auto">
          <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
            No feedback boards configured yet
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
            Categorized containers like Feature Requests, Bug Reports and Integrations will be configured in the next phase (Issue #3).
          </p>
        </div>

        <div className="pt-2 flex items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-zinc-500">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Ready for Board Configuration
          </span>
        </div>
      </div>
    </div>
  );
}
