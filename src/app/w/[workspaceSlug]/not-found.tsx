import Link from "next/link";
import { AlertCircle, ArrowLeft, PlusCircle } from "lucide-react";

export default function WorkspaceNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-500">
        <AlertCircle className="w-7 h-7" />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
          Workspace not found
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          The requested workspace URL does not exist or may have been configured with a different slug.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium bg-sky-500 hover:bg-sky-600 text-white transition-colors shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          Create Workspace
        </Link>
      </div>
    </div>
  );
}
