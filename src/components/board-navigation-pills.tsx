"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoardIcon } from "@/components/board-icon";
import { LayoutGrid, Lock, Map } from "lucide-react";
import type { Board } from "@/db/schema/boards";

interface BoardNavigationPillsProps {
  workspaceSlug: string;
  boards: Board[];
}

export function BoardNavigationPills({
  workspaceSlug,
  boards,
}: BoardNavigationPillsProps) {
  const pathname = usePathname();

  const isOverviewActive =
    pathname === `/w/${workspaceSlug}` || pathname === `/w/${workspaceSlug}/`;

  return (
    <nav className="flex items-center gap-1 -mb-px overflow-x-auto text-xs sm:text-sm font-medium scrollbar-none py-1">
      {/* Overview / All Boards Tab */}
      <Link
        href={`/w/${workspaceSlug}`}
        className={`inline-flex items-center gap-1.5 px-3 py-2 border-b-2 transition-all whitespace-nowrap focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded-md ${
          isOverviewActive
            ? "border-slate-900 dark:border-zinc-100 text-slate-900 dark:text-zinc-100 font-semibold"
            : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5 text-sky-500 shrink-0" />
        <span>All Boards</span>
      </Link>

      {/* Individual Board Navigation Pills */}
      {boards.map((board) => {
        const boardHref = `/w/${workspaceSlug}/b/${board.slug}`;
        const isBoardActive = pathname.startsWith(boardHref);

        return (
          <Link
            key={board.id}
            href={boardHref}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border-b-2 transition-all whitespace-nowrap focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded-md ${
              isBoardActive
                ? "border-slate-900 dark:border-zinc-100 text-slate-900 dark:text-zinc-100 font-semibold"
                : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
            }`}
          >
            <BoardIcon name={board.icon} className="w-3.5 h-3.5 shrink-0" />
            <span>{board.name}</span>
            {board.isPrivate && (
              <Lock className="w-2.5 h-2.5 text-amber-500 shrink-0" />
            )}
          </Link>
        );
      })}

      {/* Interactive Public Roadmap Tab */}
      <Link
        href={`/w/${workspaceSlug}/roadmap`}
        className={`inline-flex items-center gap-1.5 px-3 py-2 border-b-2 transition-all whitespace-nowrap focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded-md ${
          pathname.startsWith(`/w/${workspaceSlug}/roadmap`)
            ? "border-slate-900 dark:border-zinc-100 text-slate-900 dark:text-zinc-100 font-semibold"
            : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
        }`}
      >
        <Map className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
        <span>Roadmap</span>
      </Link>
    </nav>
  );
}
