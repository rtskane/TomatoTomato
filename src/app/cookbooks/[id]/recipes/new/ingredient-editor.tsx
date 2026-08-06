"use client";

import { useRef, useState } from "react";
import { moveItem } from "@/lib/reorder";
import { formatIngredient } from "@/lib/recipe-display";
import { useDragReorder } from "./use-drag-reorder";

export type IngredientItem = {
  key: number;
  name: string;
  quantity: string;
  unit: string;
  note: string;
};

const blankDraft = { quantity: "", unit: "", name: "", note: "" };
type Draft = typeof blankDraft;

const inputClass =
  "w-full rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm " +
  "outline-none placeholder:text-black/30 focus:border-red-500 focus:bg-transparent " +
  "dark:border-white/15 dark:bg-white/[0.04] dark:placeholder:text-white/30";

const iconButtonClass =
  "rounded-md p-1 text-black/30 hover:bg-black/5 hover:text-black/70 " +
  "disabled:pointer-events-none disabled:opacity-25 " +
  "dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white/70";

export default function IngredientEditor({
  items,
  onChange,
}: {
  items: IngredientItem[];
  onChange: (items: IngredientItem[]) => void;
}) {
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(blankDraft);
  const nameRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  const drag = useDragReorder((from, to) => onChange(moveItem(items, from, to)));

  function commitDraft() {
    if (draft.name.trim() === "") return;
    onChange([...items, { key: nextKey.current++, ...draft }]);
    setDraft(blankDraft);
    nameRef.current?.focus();
  }

  function startEditing(item: IngredientItem) {
    setEditingKey(item.key);
    setEditDraft({
      quantity: item.quantity,
      unit: item.unit,
      name: item.name,
      note: item.note,
    });
  }

  function commitEdit() {
    if (editDraft.name.trim() === "") return;
    onChange(
      items.map((i) => (i.key === editingKey ? { ...i, ...editDraft } : i)),
    );
    setEditingKey(null);
  }

  return (
    <section>
      <h2 className="text-sm font-medium">Ingredients</h2>

      {items.length > 0 ? (
        <ul {...drag.listProps} className="mt-3 space-y-1">
          {items.map((item, index) => {
            const isEditing = editingKey === item.key;
            const isDragging = drag.draggingIndex === index;
            const isOver = drag.overIndex === index && !isDragging;

            return (
              <li
                key={item.key}
                className={[
                  "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                  isDragging ? "opacity-40" : "",
                  isOver ? "bg-red-50 dark:bg-red-950/30" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {isEditing ? (
                  <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
                    <input
                      aria-label="Edit quantity"
                      value={editDraft.quantity}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, quantity: e.target.value })
                      }
                      className={`${inputClass} sm:w-16`}
                    />
                    <input
                      aria-label="Edit unit"
                      value={editDraft.unit}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, unit: e.target.value })
                      }
                      className={`${inputClass} sm:w-20`}
                    />
                    <input
                      aria-label="Edit ingredient"
                      value={editDraft.name}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit();
                        }
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                      className={inputClass}
                    />
                    <input
                      aria-label="Edit note"
                      value={editDraft.note}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, note: e.target.value })
                      }
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
                      aria-label={`Reorder ${item.name}`}
                      className="shrink-0 select-none px-1 text-black/20 dark:text-white/20"
                    >
                      ⠿
                    </span>

                    <button
                      type="button"
                      onClick={() => startEditing(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="text-sm">{formatIngredient(item)}</span>
                      {item.note ? (
                        <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                          {item.note}
                        </span>
                      ) : null}
                    </button>

                    {/* Keyboard- and touch-accessible alternative to dragging. */}
                    <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={`Move ${item.name} up`}
                        disabled={index === 0}
                        onClick={() => onChange(moveItem(items, index, index - 1))}
                        className={iconButtonClass}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.name} down`}
                        disabled={index === items.length - 1}
                        onClick={() => onChange(moveItem(items, index, index + 1))}
                        className={iconButtonClass}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() =>
                          onChange(items.filter((i) => i.key !== item.key))
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
        </ul>
      ) : null}

      {/* Composer. Stacks on small screens instead of squeezing four inputs
          into a row that would be unusable at phone widths. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <input
          aria-label="Quantity"
          placeholder="200"
          inputMode="decimal"
          value={draft.quantity}
          onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          className={`${inputClass} w-20 sm:w-16`}
        />
        <input
          aria-label="Unit"
          placeholder="g"
          value={draft.unit}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
          className={`${inputClass} w-20`}
        />
        <input
          ref={nameRef}
          aria-label="Ingredient"
          placeholder="spaghetti"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => {
            // Enter commits the row, not the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
          }}
          className={`${inputClass} min-w-32 flex-1`}
        />
        <input
          aria-label="Note"
          placeholder="finely chopped"
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
          }}
          className={`${inputClass} min-w-32 flex-1`}
        />
        <button
          type="button"
          onClick={commitDraft}
          disabled={draft.name.trim() === ""}
          className="shrink-0 rounded-lg bg-black/5 px-4 py-2 text-sm font-medium hover:bg-black/10 disabled:opacity-40 dark:bg-white/10 dark:hover:bg-white/20"
        >
          Add
        </button>
      </div>

      {/* Serialization. Committed rows plus whatever is still sitting in the
          composer — so a typed-out ingredient the user forgot to Add is never
          silently dropped on submit. Field names match what the Server Action
          already parses, so nothing server-side changes. */}
      {items.map((item) => (
        <div key={`hidden-${item.key}`}>
          <input type="hidden" name="ingredientQuantity" value={item.quantity} />
          <input type="hidden" name="ingredientUnit" value={item.unit} />
          <input type="hidden" name="ingredientName" value={item.name} />
          <input type="hidden" name="ingredientNote" value={item.note} />
        </div>
      ))}
      {draft.name.trim() !== "" ? (
        <div>
          <input type="hidden" name="ingredientQuantity" value={draft.quantity} />
          <input type="hidden" name="ingredientUnit" value={draft.unit} />
          <input type="hidden" name="ingredientName" value={draft.name} />
          <input type="hidden" name="ingredientNote" value={draft.note} />
        </div>
      ) : null}
    </section>
  );
}
