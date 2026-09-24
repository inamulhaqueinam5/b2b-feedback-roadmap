import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceCreationForm } from "@/components/workspace-creation-form";
import { Layers } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-white shadow-sm">
              <Layers className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-slate-900 dark:text-zinc-100">
              ProductFeedback
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Setup Section */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 sm:py-16 flex flex-col items-center justify-center w-full space-y-8">
        <div className="text-center space-y-3 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-sky-200 dark:border-sky-900/50 bg-sky-50/70 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">
            Multi-Tenant Feedback & Roadmap Platform
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
            Set up your workspace
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-zinc-400">
            Create an isolated customer feedback hub with public boards, community upvotes and transparent roadmaps.
          </p>
        </div>

        <WorkspaceCreationForm />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-zinc-800 py-6 text-center text-xs text-slate-400 dark:text-zinc-600">
        Modern Precision Design &bull; Powered by Next.js 15 & Drizzle ORM
      </footer>
    </div>
  );
}
