"use client";

import { useState, useTransition } from "react";
import { DollarSign, Check, X, Loader2, TrendingUp } from "lucide-react";
import { updatePostAssociatedMrrAction } from "@/actions/internal-notes";

export interface AssociatedMrrEditorProps {
  workspaceId: string;
  postId: string;
  initialMrr: string | null;
  canEdit: boolean;
}

export function AssociatedMrrEditor({
  workspaceId,
  postId,
  initialMrr,
  canEdit,
}: AssociatedMrrEditorProps) {
  const [mrr, setMrr] = useState<string | null>(initialMrr);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(
    initialMrr && Number(initialMrr) > 0 ? initialMrr : ""
  );
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!canEdit) {
    return null;
  }

  const numericValue = mrr ? Number(mrr) : 0;
  const hasValue = !isNaN(numericValue) && numericValue > 0;

  function handleStartEditing() {
    setInputValue(hasValue ? numericValue.toString() : "");
    setErrorMessage(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setIsEditing(false);
    setErrorMessage(null);
  }

  function handleSave() {
    setErrorMessage(null);
    const cleaned = inputValue.trim().replace(/^\$/, "");

    if (cleaned !== "" && (isNaN(Number(cleaned)) || Number(cleaned) < 0)) {
      setErrorMessage("Enter a valid positive number");
      return;
    }

    const valueToSave = cleaned === "" ? 0 : Number(cleaned);

    startTransition(async () => {
      const result = await updatePostAssociatedMrrAction(
        workspaceId,
        postId,
        valueToSave
      );

      if (result.success) {
        setMrr(result.associatedMrr);
        setIsEditing(false);
      } else {
        setErrorMessage(result.error);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-1.5 p-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/40 text-xs">
        <span className="text-emerald-700 dark:text-emerald-400 font-semibold pl-1">
          $
        </span>
        <input
          type="number"
          step="any"
          min="0"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0.00"
          disabled={isPending}
          autoFocus
          className="w-20 px-1 py-0.5 text-xs font-semibold rounded bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium pr-1">
          MRR
        </span>

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="p-1 rounded text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-50 transition-colors"
          title="Save MRR weight"
          aria-label="Save MRR weight"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
        </button>

        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          title="Cancel"
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {errorMessage && (
          <span className="text-[10px] text-rose-600 dark:text-rose-400 pl-1">
            {errorMessage}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleStartEditing}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border shadow-2xs ${
        hasValue
          ? "border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
          : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-zinc-100"
      }`}
      title="Customer Revenue Weighting (Associated MRR). Click to edit."
      aria-label="Edit customer revenue weighting"
    >
      {hasValue ? (
        <>
          <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            ${Number(mrr).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MRR
          </span>
        </>
      ) : (
        <>
          <DollarSign className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
          <span>Add MRR Weight</span>
        </>
      )}
    </button>
  );
}
