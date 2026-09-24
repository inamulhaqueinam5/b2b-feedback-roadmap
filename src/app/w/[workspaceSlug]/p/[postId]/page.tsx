import { notFound } from "next/navigation";
import Link from "next/link";
import { getPostDetailAction } from "@/actions/posts";
import { getActorContext } from "@/lib/auth-context";
import { UpvoteButton } from "@/components/upvote-button";
import { BoardIcon } from "@/components/board-icon";
import { CommentThread } from "@/components/comment-thread";
import { StatusDropdown } from "@/components/status-dropdown";
import { MergePostButton } from "@/components/merge-post-modal";
import { getPostCommentsAction } from "@/actions/comments";
import type { PostStatus } from "@/db/schema/posts";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Lock,
  Globe,
  Bell,
  CheckCircle2,
  GitMerge,
} from "lucide-react";

interface PostDetailPageProps {
  params: Promise<{
    workspaceSlug: string;
    postId: string;
  }>;
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { workspaceSlug, postId } = await params;
  const actor = await getActorContext({ workspaceSlug });
  const result = await getPostDetailAction(workspaceSlug, postId, actor);

  if (!result.success || !result.post) {
    notFound();
  }

  const { post, board, workspace, author, hasUpvoted, isSubscribed, mergedIntoPost } = result;

  const currentUser = actor.user
    ? {
        id: actor.userId ?? "",
        name: actor.user.name,
        email: actor.user.email,
        image: actor.user.image,
        role: actor.role,
      }
    : null;

  const commentsResult = await getPostCommentsAction(
    workspace.id,
    post.id,
    actor
  );
  const initialComments = commentsResult.success ? commentsResult.comments : [];

  const formattedDate = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400 flex-wrap">
        <Link
          href={`/w/${workspace.slug}`}
          className="hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
        >
          {workspace.name}
        </Link>
        <span>/</span>
        <Link
          href={`/w/${workspace.slug}/b/${board.slug}`}
          className="hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
        >
          {board.name}
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-zinc-100 font-semibold truncate max-w-xs">
          {post.title}
        </span>
      </nav>

      {/* Prominent Redirect Banner for Merged Posts */}
      {post.mergedIntoPostId && mergedIntoPost && (
        <div
          role="alert"
          className="rounded-2xl border border-sky-200 dark:border-sky-800/80 bg-sky-50/90 dark:bg-sky-950/40 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-300 shrink-0">
              <GitMerge className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                  Post Merged
                </span>
              </div>
              <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">
                This request was merged into{" "}
                <span className="font-semibold text-sky-700 dark:text-sky-300 underline decoration-sky-300 dark:decoration-sky-700 underline-offset-2">
                  {mergedIntoPost.title}
                </span>
                . All discussion and upvotes have been transferred.
              </p>
            </div>
          </div>

          <Link
            href={`/w/${workspace.slug}/p/${mergedIntoPost.id}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 active:scale-[0.98] transition-all shrink-0 shadow-2xs cursor-pointer"
          >
            <span>View Master Request</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Main Post Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          {/* Header Row: Back Link & Board Pill */}
          <div className="flex items-center justify-between gap-4">
            <Link
              href={`/w/${workspace.slug}/b/${board.slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to {board.name}</span>
            </Link>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 text-slate-600 dark:text-zinc-400">
                <BoardIcon name="message-square" className="w-3 h-3 text-sky-500" />
                {board.name}
              </span>
              {board.isPrivate ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                  <Lock className="w-2.5 h-2.5" />
                  Private
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                  <Globe className="w-2.5 h-2.5" />
                  Public
                </span>
              )}
            </div>
          </div>

          {/* Post Content Surface */}
          <div className="flex items-start gap-4 sm:gap-6">
            {/* Tactile Upvote Button: prominent detail view sizing */}
            <div className="shrink-0 pt-1">
              <UpvoteButton
                postId={post.id}
                workspaceSlug={workspace.slug}
                workspaceId={workspace.id}
                initialUpvoteCount={post.upvoteCount}
                initialHasUpvoted={hasUpvoted}
                currentUser={currentUser}
                size="lg"
                orientation="vertical"
                disabled={!!post.mergedIntoPostId}
              />
            </div>

            {/* Title, Status and Description */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                    {post.title}
                  </h1>
                  <StatusDropdown
                    workspaceId={workspace.id}
                    workspaceSlug={workspace.slug}
                    postId={post.id}
                    currentStatus={post.status as PostStatus}
                    canModerate={actor.role === "owner" || actor.role === "admin"}
                  />
                  <MergePostButton
                    workspaceId={workspace.id}
                    workspaceSlug={workspace.slug}
                    post={{ id: post.id, title: post.title }}
                    canMerge={(actor.role === "owner" || actor.role === "admin") && !post.mergedIntoPostId}
                  />
                </div>

                {/* Metadata Row */}
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 flex-wrap">
                  <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-zinc-300">
                    {author.image ? (
                      <img
                        src={author.image}
                        alt={author.name ?? "Author"}
                        className="w-4 h-4 rounded-full"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center text-[9px] font-bold">
                        {(author.name ?? author.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span>{author.name ?? author.email}</span>
                  </div>

                  <span>•</span>

                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formattedDate}</span>
                  </div>

                  {isSubscribed && (
                    <>
                      <span>•</span>
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Bell className="w-3.5 h-3.5" />
                        <span>Subscribed to updates</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Description Body */}
              <div className="prose prose-slate dark:prose-invert max-w-none text-sm sm:text-base text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap pt-2 border-t border-slate-100 dark:border-zinc-800/80">
                {post.description}
              </div>
            </div>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="px-6 sm:px-8 py-3.5 bg-slate-50 dark:bg-zinc-800/40 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" />
            <span>Community feedback tracked on {workspace.name}</span>
          </div>

          <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
            ID: {post.id.slice(0, 8)}
          </div>
        </div>
      </div>

      {/* Community Comments & Threading */}
      <CommentThread
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        postId={post.id}
        initialComments={initialComments}
        currentUser={currentUser}
      />
    </div>
  );
}
