"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Plus,
  X,
  Lock,
  Globe,
  ChevronUp,
  ChevronDown,
  Pencil,
  Archive,
  Check,
  AlertCircle,
  Loader2,
  FolderKanban,
} from "lucide-react";
import { BoardIcon } from "@/components/board-icon";
import {
  createBoardAction,
  updateBoardAction,
  archiveBoardAction,
  reorderBoardsAction,
} from "@/actions/boards";
import { sanitizeBoardSlug, SUPPORTED_BOARD_ICONS } from "@/lib/validation/board";
import type { Board } from "@/db/schema/boards";

interface BoardManagementDialogProps {
  workspaceSlug: string;
  boards: Board[];
  triggerClassName?: string;
  triggerLabel?: string;
}

export function BoardManagementDialog({
  workspaceSlug,
  boards: initialBoards,
  triggerClassName,
  triggerLabel = "Manage Boards",
}: BoardManagementDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"list" | "create" | "edit">("list");
  const [boards, setBoards] = useState<Board[]>(initialBoards);

  // Form State
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugTouched, setIsSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("message-square");
  const [isPrivate, setIsPrivate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync initialBoards when props update
  if (initialBoards !== boards && !isOpen) {
    setBoards(initialBoards);
  }

  function resetForm() {
    setEditingBoardId(null);
    setName("");
    setSlug("");
    setIsSlugTouched(false);
    setDescription("");
    setIcon("message-square");
    setIsPrivate(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function openCreate() {
    resetForm();
    setActiveTab("create");
  }

  function openEdit(board: Board) {
    setEditingBoardId(board.id);
    setName(board.name);
    setSlug(board.slug);
    setIsSlugTouched(true);
    setDescription(board.description ?? "");
    setIcon(board.icon ?? "message-square");
    setIsPrivate(board.isPrivate);
    setErrorMessage(null);
    setSuccessMessage(null);
    setActiveTab("edit");
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!isSlugTouched) {
      setSlug(sanitizeBoardSlug(value));
    }
  }

  async function handleSaveBoard(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const inputData = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      icon,
      isPrivate,
    };

    startTransition(async () => {
      if (activeTab === "create") {
        const res = await createBoardAction(workspaceSlug, inputData);
        if (res.success) {
          setBoards((prev) => [...prev, res.board]);
          setSuccessMessage("Board created successfully");
          setTimeout(() => {
            resetForm();
            setActiveTab("list");
            router.refresh();
          }, 800);
        } else {
          setErrorMessage(res.error);
        }
      } else if (activeTab === "edit" && editingBoardId) {
        const res = await updateBoardAction(workspaceSlug, editingBoardId, inputData);
        if (res.success) {
          setBoards((prev) =>
            prev.map((b) => (b.id === res.board.id ? res.board : b))
          );
          setSuccessMessage("Board updated successfully");
          setTimeout(() => {
            resetForm();
            setActiveTab("list");
            router.refresh();
          }, 800);
        } else {
          setErrorMessage(res.error);
        }
      }
    });
  }

  async function handleArchive(boardId: string) {
    if (!confirm("Are you sure you want to archive this board? Visitors will no longer see it.")) {
      return;
    }

    startTransition(async () => {
      const res = await archiveBoardAction(workspaceSlug, boardId);
      if (res.success) {
        setBoards((prev) => prev.filter((b) => b.id !== boardId));
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= boards.length) return;

    const newBoards = [...boards];
    const [moved] = newBoards.splice(index, 1);
    newBoards.splice(targetIndex, 0, moved);

    const items = newBoards.map((b, i) => ({ id: b.id, sortOrder: i }));
    setBoards(newBoards);

    startTransition(async () => {
      const res = await reorderBoardsAction(workspaceSlug, { items });
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm();
          setActiveTab("list");
          setIsOpen(true);
        }}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
        }
      >
        <Settings className="w-3.5 h-3.5 text-slate-500" />
        {triggerLabel}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => !isPending && setIsOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    Feedback Boards Management
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Configure categories, manage ordering and toggle visibility
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="px-6 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-4 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab("list")}
                className={`py-3 border-b-2 transition-colors ${
                  activeTab === "list"
                    ? "border-sky-500 text-sky-600 dark:text-sky-400 font-semibold"
                    : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                }`}
              >
                All Boards ({boards.length})
              </button>
              <button
                type="button"
                onClick={openCreate}
                className={`py-3 border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === "create"
                    ? "border-sky-500 text-sky-600 dark:text-sky-400 font-semibold"
                    : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Board
              </button>
              {activeTab === "edit" && (
                <button
                  type="button"
                  className="py-3 border-b-2 border-sky-500 text-sky-600 dark:text-sky-400 font-semibold inline-flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Board
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {activeTab === "list" && (
                <div className="space-y-4">
                  {boards.length === 0 ? (
                    <div className="text-center py-10 space-y-3">
                      <FolderKanban className="w-8 h-8 mx-auto text-slate-400 dark:text-zinc-600" />
                      <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                        No boards configured yet
                      </p>
                      <button
                        type="button"
                        onClick={openCreate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create Your First Board
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900/50">
                      {boards.map((board, idx) => (
                        <div
                          key={board.id}
                          className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/75 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* Board Info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 flex items-center justify-center text-slate-700 dark:text-zinc-300 shrink-0">
                              <BoardIcon name={board.icon} className="w-4 h-4 text-sky-500" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">
                                  {board.name}
                                </h4>
                                {board.isPrivate ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                                    <Lock className="w-2.5 h-2.5" />
                                    Private
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                                    <Globe className="w-2.5 h-2.5" />
                                    Public
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                                /b/{board.slug} {board.description && `• ${board.description}`}
                              </p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMove(idx, "up")}
                              disabled={idx === 0 || isPending}
                              title="Move Up"
                              className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMove(idx, "down")}
                              disabled={idx === boards.length - 1 || isPending}
                              title="Move Down"
                              className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(board)}
                              disabled={isPending}
                              title="Edit Board"
                              className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchive(board.id)}
                              disabled={isPending}
                              title="Archive Board"
                              className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(activeTab === "create" || activeTab === "edit") && (
                <form onSubmit={handleSaveBoard} className="space-y-4">
                  {errorMessage && (
                    <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {successMessage && (
                    <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{successMessage}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Board Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Feature Requests"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      URL Slug
                    </label>
                    <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 focus-within:ring-2 focus-within:ring-sky-500">
                      <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono select-none">
                        /w/{workspaceSlug}/b/
                      </span>
                      <input
                        type="text"
                        required
                        value={slug}
                        onChange={(e) => {
                          setIsSlugTouched(true);
                          setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                        }}
                        placeholder="feature-requests"
                        className="w-full bg-transparent text-sm font-mono text-slate-900 dark:text-zinc-100 focus:outline-none ml-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Description (Optional)
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of what feedback belongs here..."
                      rows={2}
                      maxLength={500}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                    />
                  </div>

                  {/* Icon Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Board Icon
                    </label>
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {SUPPORTED_BOARD_ICONS.map((iconKey) => {
                        const isSelected = icon === iconKey;
                        return (
                          <button
                            key={iconKey}
                            type="button"
                            onClick={() => setIcon(iconKey)}
                            title={iconKey}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
                              isSelected
                                ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 ring-2 ring-sky-500/20 shadow-sm"
                                : "border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700 hover:text-slate-800 dark:hover:text-zinc-200"
                            }`}
                          >
                            <BoardIcon name={iconKey} className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Privacy Toggle */}
                  <div className="pt-2">
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="isPrivateCheckbox"
                        checked={isPrivate}
                        onChange={(e) => setIsPrivate(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 dark:border-zinc-700 text-sky-600 focus:ring-sky-500"
                      />
                      <label htmlFor="isPrivateCheckbox" className="cursor-pointer select-none">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-zinc-100">
                          {isPrivate ? (
                            <>
                              <Lock className="w-3.5 h-3.5 text-amber-500" />
                              Private Board (Internal Only)
                            </>
                          ) : (
                            <>
                              <Globe className="w-3.5 h-3.5 text-emerald-500" />
                              Public Board (Visible to All Visitors)
                            </>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                          {isPrivate
                            ? "Only authenticated workspace members and admins can view and post on this board. It is hidden from public visitors."
                            : "Anyone visiting your workspace link can view this board, explore suggestions and participate."}
                        </p>
                      </label>
                    </div>
                  </div>

                  {/* Form Footer */}
                  <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setActiveTab("list")}
                      disabled={isPending}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending || !name.trim() || !slug.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors shadow-sm"
                    >
                      {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {activeTab === "create" ? "Create Board" : "Save Changes"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
