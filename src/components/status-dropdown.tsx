"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { ChevronDown, Loader2, Check } from "lucide-react";
import { updatePostStatusAction } from "@/actions/posts";
import type { PostStatus } from "@/db/schema/posts";

export interface StatusConfig {
  label: string;
  dot: string;
  badge: string;
  hover: string;
  description: string;
}

export const STATUS_CONFIG: Record<PostStatus, StatusConfig> = {
  open: {
    label: "Open",
    dot: "bg-slate-400 dark:bg-zinc-500",
    badge:
      "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700",
    hover: "hover:bg-slate-200 dark:hover:bg-zinc-700",
    description: "Newly submitted feedback awaiting triage",
  },
  under_review: {
    label: "Under Review",
    dot: "bg-indigo-500",
    badge:
      "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    hover: "hover:bg-indigo-100 dark:hover:bg-indigo-900/60",
    description: "Under team evaluation and investigation",
  },
  planned: {
    label: "Planned",
    dot: "bg-amber-500",
    badge:
      "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    hover: "hover:bg-amber-100 dark:hover:bg-amber-900/60",
    description: "Scheduled on the public product roadmap",
  },
  in_progress: {
    label: "In Progress",
    dot: "bg-sky-500",
    badge:
      "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
    hover: "hover:bg-sky-100 dark:hover:bg-sky-900/60",
    description: "Actively being designed, developed and tested",
  },
  completed: {
    label: "Completed",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    hover: "hover:bg-emerald-100 dark:hover:bg-emerald-900/60",
    description: "Shipped and released to customers",
  },
  closed: {
    label: "Closed",
    dot: "bg-zinc-400",
    badge:
      "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
    hover: "hover:bg-zinc-200 dark:hover:bg-zinc-700",
    description: "Closed without implementation or duplicate",
  },
};

const STATUS_ORDER: PostStatus[] = [
  "open",
  "under_review",
  "planned",
  "in_progress",
  "completed",
  "closed",
];

export interface StatusDropdownProps {
  workspaceId: string;
  workspaceSlug: string;
  postId: string;
  currentStatus: PostStatus;
  canModerate: boolean;
  onStatusChange?: (newStatus: PostStatus) => void;
  size?: "sm" | "md";
  className?: string;
}

export function StatusDropdown({
  workspaceId,
  workspaceSlug,
  postId,
  currentStatus,
  canModerate,
  onStatusChange,
  size = "md",
  className = "",
}: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<PostStatus>(currentStatus);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedStatus(currentStatus);
  }, [currentStatus]);

  // Handle outside click and escape key to close menu
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const currentConfig = STATUS_CONFIG[selectedStatus] ?? STATUS_CONFIG.open;
  const isSmall = size === "sm";

  // Static read-only badge for non-moderators
  if (!canModerate) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider rounded-full border select-none transition-colors ${
          isSmall ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-0.5 text-[10px]"
        } ${currentConfig.badge} ${className}`}
        title={`Status: ${currentConfig.label}`}
      >
        <span
          className={`rounded-full shrink-0 ${
            isSmall ? "w-1.5 h-1.5" : "w-1.5 h-1.5"
          } ${currentConfig.dot}`}
        />
        <span>{currentConfig.label}</span>
      </span>
    );
  }

  function handleSelectStatus(
    newStatus: PostStatus,
    e: React.MouseEvent<HTMLButtonElement>
  ) {
    e.preventDefault();
    e.stopPropagation();

    if (newStatus === selectedStatus) {
      setIsOpen(false);
      return;
    }

    const previousStatus = selectedStatus;
    setSelectedStatus(newStatus);
    setIsOpen(false);

    startTransition(async () => {
      const result = await updatePostStatusAction(
        workspaceId,
        postId,
        newStatus
      );

      if (result.success) {
        onStatusChange?.(newStatus);
      } else {
        // Revert upon failure
        setSelectedStatus(previousStatus);
      }
    });
  }

  return (
    <div
      ref={dropdownRef}
      className={`relative inline-block text-left ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={isPending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Change status, current status is ${currentConfig.label}`}
        className={`inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider rounded-full border transition-all cursor-pointer shadow-2xs select-none disabled:opacity-60 disabled:cursor-not-allowed ${
          isSmall ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-0.5 text-[10px]"
        } ${currentConfig.badge} ${currentConfig.hover}`}
      >
        {isPending ? (
          <Loader2
            className={`animate-spin text-current ${
              isSmall ? "w-2.5 h-2.5" : "w-3 h-3"
            }`}
          />
        ) : (
          <span
            className={`rounded-full shrink-0 ${
              isSmall ? "w-1.5 h-1.5" : "w-1.5 h-1.5"
            } ${currentConfig.dot}`}
          />
        )}
        <span>{currentConfig.label}</span>
        <ChevronDown
          className={`shrink-0 transition-transform text-current opacity-70 ${
            isOpen ? "rotate-180" : ""
          } ${isSmall ? "w-2.5 h-2.5" : "w-3 h-3"}`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Select post status"
          className="absolute left-0 mt-1.5 w-56 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1.5 z-50 text-left focus:outline-hidden animate-in fade-in-50 zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 border-b border-slate-100 dark:border-zinc-800/80 mb-1">
            Change Post Status
          </div>

          <div className="space-y-0.5">
            {STATUS_ORDER.map((statusKey) => {
              const config = STATUS_CONFIG[statusKey];
              const isCurrent = statusKey === selectedStatus;

              return (
                <button
                  key={statusKey}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={(e) => handleSelectStatus(statusKey, e)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    isCurrent
                      ? "bg-slate-100 dark:bg-zinc-800/80 text-slate-900 dark:text-zinc-100 font-semibold"
                      : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs truncate">{config.label}</div>
                      <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate font-normal">
                        {config.description}
                      </div>
                    </div>
                  </div>

                  {isCurrent && (
                    <Check className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
