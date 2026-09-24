"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import {
  getNotificationsAction,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
} from "@/actions/notifications";
import type { UserNotificationItem } from "@/services/notifications";
import { STATUS_CONFIG } from "@/components/status-dropdown";
import type { PostStatus } from "@/db/schema/posts";

interface NotificationDropdownProps {
  workspaceSlug: string;
}

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationDropdown({ workspaceSlug }: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load notifications
  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const result = await getNotificationsAction(workspaceSlug);
      if (result.success) {
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
      }
    } catch {
      // Ignored for unauthenticated or network failures
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [workspaceSlug]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      loadNotifications();
    }
  };

  const handleMarkAsRead = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    startTransition(async () => {
      await markNotificationAsReadAction(workspaceSlug, notificationId);
    });
  };

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    startTransition(async () => {
      await markAllNotificationsAsReadAction(workspaceSlug);
    });
  };

  const handleNotificationClick = (item: UserNotificationItem) => {
    if (!item.isRead) {
      // Optimistic read
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      startTransition(async () => {
        await markNotificationAsReadAction(workspaceSlug, item.id);
      });
    }

    setIsOpen(false);
    if (item.postId) {
      router.push(`/w/${workspaceSlug}/p/${item.postId}`);
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Activity Notifications"
        aria-expanded={isOpen}
        className="relative p-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      >
        <Bell className="w-4 h-4 text-slate-600 dark:text-zinc-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-zinc-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Modern Precision Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl z-50 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/70 dark:bg-zinc-900/70">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/60">
            {isLoading && notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-500" />
                <p className="text-xs">Loading updates...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-zinc-400">
                <Bell className="w-8 h-8 text-slate-300 dark:text-zinc-700 mx-auto mb-2 opacity-60" />
                <p className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                  No notifications yet
                </p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                  Updates on feedback you create or follow will appear here
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const statusConf = item.postStatus
                  ? STATUS_CONFIG[item.postStatus as PostStatus]
                  : null;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`group relative flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                      item.isRead
                        ? "bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                        : "bg-sky-50/40 dark:bg-sky-950/20 hover:bg-sky-50/70 dark:hover:bg-sky-950/30"
                    }`}
                  >
                    {/* Read / Unread Indicator Dot */}
                    <div className="pt-1 flex-shrink-0">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          item.isRead ? "bg-transparent" : "bg-sky-500"
                        }`}
                      />
                    </div>

                    {/* Notification Body */}
                    <div className="flex-1 min-w-0">
                      {statusConf && (
                        <div className="mb-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${statusConf.badge}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`}
                            />
                            {statusConf.label}
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-slate-800 dark:text-zinc-200 leading-snug line-clamp-2">
                        {item.message}
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1 block">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    {/* Individual Mark As Read Button */}
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkAsRead(e, item.id)}
                        title="Mark as read"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-all flex-shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
