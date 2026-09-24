import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceAction } from "@/actions/workspaces";
import { getBoardsAction } from "@/actions/boards";
import { getRoadmapAction } from "@/actions/roadmap";
import { getActorContext } from "@/lib/auth-context";
import { RoadmapBoard } from "@/components/roadmap-board";
import { Map, ArrowLeft, Sparkles } from "lucide-react";

interface RoadmapPageProps {
  params: Promise<{
    workspaceSlug: string;
  }>;
  searchParams?: Promise<{
    boardId?: string;
  }>;
}

export async function generateMetadata({ params }: RoadmapPageProps) {
  const { workspaceSlug } = await params;
  const ws = await getWorkspaceAction(workspaceSlug);
  const name = ws.success && ws.workspace ? ws.workspace.name : "Workspace";
  return {
    title: `Product Roadmap - ${name}`,
    description: `Explore planned, in-progress and completed features across our product boards on ${name}.`,
  };
}

export default async function RoadmapPage({
  params,
  searchParams,
}: RoadmapPageProps) {
  const { workspaceSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const boardId = resolvedSearchParams.boardId;

  const actor = await getActorContext({ workspaceSlug });

  const [workspaceResult, boardsResult] = await Promise.all([
    getWorkspaceAction(workspaceSlug),
    getBoardsAction(workspaceSlug, actor),
  ]);

  if (!workspaceResult.success || !workspaceResult.workspace) {
    notFound();
  }

  const { workspace } = workspaceResult;
  const boards = boardsResult.success ? boardsResult.boards : [];

  const roadmapResult = await getRoadmapAction(
    workspace.id,
    boardId ? { boardId } : undefined,
    actor
  );

  const roadmap = roadmapResult.success
    ? roadmapResult.roadmap
    : {
        columns: {
          planned: [],
          inProgress: [],
          completed: [],
          in_progress: [],
        },
        counts: {
          planned: 0,
          inProgress: 0,
          completed: 0,
          total: 0,
        },
      };

  const currentUser = actor.user
    ? {
        id: actor.userId ?? "",
        name: actor.user.name,
        email: actor.user.email,
      }
    : null;

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
        <span className="text-slate-900 dark:text-zinc-100 font-semibold">
          Roadmap
        </span>
      </nav>

      {/* Hero Surface Header */}
      <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm relative overflow-hidden">
        <div
          className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ backgroundColor: workspace.brandColor }}
        />

        <div className="relative space-y-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
            <Map className="w-3.5 h-3.5" />
            <span>Interactive Kanban Roadmap</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
              Product Roadmap
            </h1>
            <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Track what our team is planning, building and recently shipped. Cast your upvotes on upcoming features to influence our product direction.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Kanban Board */}
      <RoadmapBoard
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        boards={boards}
        initialRoadmap={roadmap}
        initialBoardId={boardId}
        currentUser={currentUser}
      />
    </div>
  );
}
