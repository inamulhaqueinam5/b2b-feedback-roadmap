"use client";

import { useState, useEffect, useTransition } from "react";
import {
  X,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  ThumbsUp,
  MessageSquare,
  FileText,
} from "lucide-react";
import {
  requestMagicLinkAction,
  verifyMagicLinkAction,
  signInWithOAuthAction,
} from "@/actions/auth";
import {
  getQueuedIntent,
  clearQueuedIntent,
  executeQueuedIntent,
  type QueuedIntent,
} from "@/lib/intent-capture";

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: { id: string; email: string; name?: string | null }) => void;
  onIntentReplay?: (intent: QueuedIntent) => Promise<boolean> | boolean;
  title?: string;
  description?: string;
  intentMessage?: string;
  defaultEmail?: string;
}

export function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  onIntentReplay,
  title = "Sign in to continue",
  description = "Join the workspace community to share feedback, join discussions and vote on features.",
  intentMessage,
  defaultEmail = "",
}: AuthModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [isPending, startTransition] = useTransition();
  const [isMagicLinkSent, setIsMagicLinkSent] = useState(false);
  const [demoToken, setDemoToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeIntent, setActiveIntent] = useState<QueuedIntent | null>(null);

  useEffect(() => {
    if (isOpen) {
      const intent = getQueuedIntent();
      setActiveIntent(intent);
      setErrorMessage(null);
      setIsMagicLinkSent(false);
      setDemoToken(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleAuthSuccess(user: { id: string; email: string; name?: string | null }) {
    if (activeIntent) {
      if (onIntentReplay) {
        await executeQueuedIntent(onIntentReplay);
      } else {
        clearQueuedIntent();
      }
    }

    if (onSuccess) {
      onSuccess(user);
    }

    onClose();
  }

  function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address");
      return;
    }

    startTransition(async () => {
      const result = await requestMagicLinkAction(email);
      if (result.success) {
        setIsMagicLinkSent(true);
        if (result.token) {
          setDemoToken(result.token);
        }
      } else {
        setErrorMessage(result.error ?? "Failed to send magic link");
      }
    });
  }

  function handleVerifyDemoToken() {
    if (!demoToken) return;
    setErrorMessage(null);

    startTransition(async () => {
      const result = await verifyMagicLinkAction(demoToken, email);
      if (result.success && result.user) {
        await handleAuthSuccess(result.user);
      } else {
        setErrorMessage(result.error ?? "Invalid or expired token");
      }
    });
  }

  function handleOAuthMock(provider: "google" | "github") {
    setErrorMessage(null);
    const mockEmail = email && email.includes("@")
      ? email
      : `${provider}-user-${Math.floor(Math.random() * 1000)}@example.com`;

    startTransition(async () => {
      const result = await signInWithOAuthAction({
        provider,
        providerAccountId: `mock-${provider}-${Date.now()}`,
        email: mockEmail,
        name: provider === "google" ? "Google User" : "GitHub User",
        image: null,
      });

      if (result.success && result.user) {
        await handleAuthSuccess(result.user);
      } else {
        setErrorMessage(result.error ?? `Failed to sign in with ${provider}`);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isPending}
          className="absolute top-4 right-4 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 p-1 rounded-md transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Queued Intent Banner */}
        {activeIntent && (
          <div className="mb-5 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 flex items-start gap-2.5">
            {activeIntent.type === "upvote" && (
              <ThumbsUp className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            {activeIntent.type === "create_post" && (
              <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            {activeIntent.type === "create_comment" && (
              <MessageSquare className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            {activeIntent.type === "custom" && (
              <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            <div className="text-xs">
              <span className="font-semibold text-sky-900 dark:text-sky-200">
                Action queued:{" "}
              </span>
              <span className="text-sky-800 dark:text-sky-300">
                {intentMessage ??
                  (activeIntent.type === "upvote"
                    ? "Your upvote is saved and will be cast automatically after sign-in."
                    : activeIntent.type === "create_post"
                    ? "Your post draft is preserved and will be ready to submit."
                    : "Your pending action will complete immediately after signing in.")}
              </span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
            {description}
          </p>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!isMagicLinkSent ? (
          <div className="space-y-4">
            {/* OAuth Provider Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleOAuthMock("google")}
                disabled={isPending}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-xs font-medium text-slate-700 dark:text-zinc-200 transition-colors shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => handleOAuthMock("github")}
                disabled={isPending}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-xs font-medium text-slate-700 dark:text-zinc-200 transition-colors shadow-sm disabled:opacity-50"
              >
                <svg
                  className="w-4 h-4 fill-current shrink-0 text-slate-800 dark:text-zinc-200"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>GitHub</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                <span className="bg-white dark:bg-zinc-900 px-2 text-slate-400 dark:text-zinc-500 font-mono">
                  Or passwordless link
                </span>
              </div>
            </div>

            {/* Magic Link Form */}
            <form onSubmit={handleSendMagicLink} className="space-y-3">
              <div>
                <label
                  htmlFor="auth-email-input"
                  className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1"
                >
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    disabled={isPending}
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-zinc-800/50 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs sm:text-sm font-medium transition shadow-sm disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending magic link...</span>
                  </>
                ) : (
                  <>
                    <span>Send Magic Link</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Magic Link Sent State */
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
                Check your inbox
              </h3>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                We sent a secure sign-in link to{" "}
                <span className="font-semibold">{email}</span>.
              </p>
            </div>

            {demoToken && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60 text-center space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Development mode: you can verify immediately below
                </p>
                <button
                  type="button"
                  onClick={handleVerifyDemoToken}
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Complete Sign-in (Instant)</span>
                  )}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsMagicLinkSent(false)}
              className="w-full text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors py-1"
            >
              Use a different email
            </button>
          </div>
        )}

        <div className="mt-5 text-center">
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">
            By signing in, you agree to our terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}
