"use client";

import { useRef, useState } from "react";
import { moveItem } from "@/lib/reorder";
import { useDragReorder } from "./use-drag-reorder";

export type StepItem = { key: number; instruction: string };

const inputClass =
  "w-full resize-none rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm " +
  "outline-none placeholder:text-black/30 focus:border-red-500 focus:bg-transparent " +
  "dark:border-white/15 dark:bg-white/[0.04] dark:placeholder:text-white/30";

const iconButtonClass =
  "rounded-md p-1 text-black/30 hover:bg-black/5 hover:text-black/70 " +
  "disabled:pointer-events-none disabled:opacity-25 " +
  "dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white/70";

export default function StepEditor({
  items,
  onChange,
}: {
  items: StepItem[];
  onChange: (items: StepItem[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const nextKey = useRef(0);

  const drag = useDragReorder((from, to) => onChange(moveItem(items, from, to)));

  function commitDraft() {
    if (draft.trim() === "") return;
    onChange([...items, { key: nextKey.current++, instruction: draft }]);
    setDraft("");
    draftRef.current?.focus();
  }

  function commitEdit() {
    if (editDraft.trim() === "") return;
    onChange(
      items.map((s) =>
        s.key === editingKey ? { ...s, instruction: editDraft } : s,
      ),
    );
    setEditingKey(null);
  }

  return (
    <section>
      <h2 className="text-sm font-medium">Steps</h2>

      {items.length > 0 ? (
        <ol {...drag.listProps} className="mt-3 space-y-1">
          {items.map((item, index) => {
            const isEditing = editingKey === item.key;
            const isDragging = drag.draggingIndex === index;
            const isOver = drag.overIndex === index && !isDragging;
            const label = `step ${index + 1}`;

            return (
              <li
                key={item.key}
                className={[
                  "group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors",
                  isDragging ? "opacity-40" : "",
                  isOver ? "bg-red-50 dark:bg-red-950/30" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {isEditing ? (
                  <div className="flex w-full items-start gap-2">
                    <textarea
                      aria-label={`Edit ${label}`}
                      rows={2}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter commits; Shift+Enter keeps a line break, since
                        // a step can legitimately be multi-line.
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitEdit();
                        }
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={commitEdit}
                      className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      {...drag.handleProps(index)}
                      aria-label={`Reorder ${label}`}
                      className="mt-0.5 shrink-0 select-none px-1 text-black/20 dark:text-white/20"
                    >
                      ⠿
                    </span>
                    <span className="mt-0.5 w-5 shrink-0 text-sm tabular-nums text-black/35 dark:text-white/35">
                      {index + 1}.
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingKey(item.key);
                        setEditDraft(item.instruction);
                      }}
                      className="min-w-0 flex-1 whitespace-pre-wrap text-left text-sm"
                    >
                      {item.instruction}
                    </button>

                    <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={`Move ${label} up`}
                        disabled={index === 0}
                        onClick={() => onChange(moveItem(items, index, index - 1))}
                        className={iconButtonClass}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${label} down`}
                        disabled={index === items.length - 1}
                        onClick={() => onChange(moveItem(items, index, index + 1))}
                        className={iconButtonClass}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${label}`}
                        onClick={() =>
                          onChange(items.filter((s) => s.key !== item.key))
                        }
                        className={iconButtonClass}
                      >
                        ×
                      </button>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="mt-3 flex items-start gap-2">
        <textarea
          ref={draftRef}
          aria-label="Next step"
          rows={2}
          placeholder="Boil the pasta until al dente."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitDraft();
            }
          }}
          className={inputClass}
        />
        <button
          type="button"
          onClick={commitDraft}
          disabled={draft.trim() === ""}
          className="shrink-0 rounded-lg bg-black/5 px-4 py-2 text-sm font-medium hover:bg-black/10 disabled:opacity-40 dark:bg-white/10 dark:hover:bg-white/20"
        >
          Add
        </button>
      </div>

      {/* Committed steps plus any uncommitted draft, so nothing typed is lost. */}
      {items.map((item) => (
        <input
          key={`hidden-${item.key}`}
          type="hidden"
          name="stepInstruction"
          value={item.instruction}
        />
      ))}
      {draft.trim() !== "" ? (
        <input type="hidden" name="stepInstruction" value={draft} />
      ) : null}
    </section>
  );
}
