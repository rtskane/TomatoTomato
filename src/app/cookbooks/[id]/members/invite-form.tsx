"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { InviteState } from "./actions";
import type { InviteOutcome } from "@/server/services/member.service";

const initialState: InviteState = {};

type InviteAction = (
  state: InviteState,
  formData: FormData,
) => Promise<InviteState>;

type Row = { key: number; username: string; role: "EDITOR" | "VIEWER" };

// Keys only need to be unique within a session and never leave the client — a
// counter is enough, and unlike an array index it survives removals without
// React reusing the wrong DOM node.
let nextKey = 0;
const takeKey = () => nextKey++;

const blankRow = (role: Row["role"] = "VIEWER"): Row => ({
  key: takeKey(),
  username: "",
  role,
});

// No width here on purpose. Tailwind resolves competing utilities by their
// order in the generated stylesheet, not by their order in the class string, so
// a `w-full` baked in here would beat the `w-28` and `flex-1` added per field
// and collapse the row. Each field sets its own width.
const fieldClass =
  "rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm " +
  "outline-none placeholder:text-black/30 focus:border-red-500 focus:bg-transparent " +
  "dark:border-white/15 dark:bg-white/[0.04] dark:placeholder:text-white/30";

// How each per-row result reads. Keeping the wording here rather than in the
// service keeps the service free of UI copy.
function outcomeMessage(outcome: InviteOutcome): string {
  switch (outcome.status) {
    case "invited":
      return `Invited as ${outcome.role.toLowerCase()}.`;
    case "not-found":
      return "No one goes by that username.";
    case "already-member":
      return "Already in this cookbook.";
    case "duplicate":
      return "Listed more than once — invited once.";
    case "self":
      return "That's you.";
    case "invalid":
      return outcome.message;
  }
}

export default function InviteForm({ action }: { action: InviteAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // React to a completed submit during render — React's documented way to
  // adjust state when a prop changes — rather than in an effect, which would
  // cost an extra commit and briefly show the stale rows.
  const [seen, setSeen] = useState(state.outcomes);
  if (state.outcomes !== seen) {
    setSeen(state.outcomes);
    if (state.outcomes) {
      // Keep the rows that didn't go through so they can be corrected in
      // place, and clear the ones that did. A typo shouldn't cost the user the
      // other four names they just typed.
      const failed = new Set(
        state.outcomes
          .filter((outcome) => outcome.status !== "invited")
          .map((outcome) => outcome.username),
      );
      const kept = rows.filter(
        (row) => row.username.trim() !== "" && failed.has(row.username.trim()),
      );
      setRows(kept.length > 0 ? kept : [blankRow()]);
    }
  }

  useEffect(() => {
    if (state.error) firstFieldRef.current?.focus();
  }, [state]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  // A new row inherits the last row's role. The common case is inviting several
  // people at the same level, so this makes per-row control cost nothing when
  // you don't need it — while still leaving every row independently settable.
  const addRow = () =>
    setRows((current) => [
      ...current,
      blankRow(current[current.length - 1]?.role ?? "VIEWER"),
    ]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-2">
            <input
              ref={index === 0 ? firstFieldRef : undefined}
              name="inviteUsername"
              value={row.username}
              onChange={(e) => update(row.key, { username: e.target.value })}
              onKeyDown={(e) => {
                // Enter adds another row rather than submitting a half-filled
                // list — the same reflex the ingredient composer trains.
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRow();
                }
              }}
              placeholder="username"
              autoComplete="off"
              aria-label={`Username for person ${index + 1}`}
              className={`${fieldClass} min-w-0 flex-1`}
            />

            <select
              name="inviteRole"
              value={row.role}
              onChange={(e) =>
                update(row.key, { role: e.target.value as Row["role"] })
              }
              aria-label={`Role for person ${index + 1}`}
              className={`${fieldClass} w-28 shrink-0`}
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>

            <button
              type="button"
              onClick={() =>
                setRows((current) => current.filter((r) => r.key !== row.key))
              }
              disabled={rows.length === 1}
              aria-label={`Remove person ${index + 1}`}
              className="shrink-0 rounded-md p-1 text-black/30 hover:bg-black/5 hover:text-black/70 disabled:pointer-events-none disabled:opacity-25 dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white/70"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addRow}
        className="text-sm text-black/60 hover:underline dark:text-white/60"
      >
        + Add another
      </button>

      <p className="text-xs text-black/50 dark:text-white/50">
        Viewers can read recipes. Editors can add and edit their own. Nobody
        joins until they accept.
      </p>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      {/* Per-person results. A batch can half-succeed, so this reports each
          name rather than collapsing to one message. */}
      {state.outcomes && state.outcomes.length > 0 ? (
        <ul role="status" className="space-y-1 text-sm">
          {state.outcomes.map((outcome, i) => (
            <li
              key={`${outcome.username}-${i}`}
              className={
                outcome.status === "invited"
                  ? "text-green-700 dark:text-green-400"
                  : "text-amber-700 dark:text-amber-400"
              }
            >
              <span className="font-medium">{outcome.username}</span>{" "}
              {outcomeMessage(outcome)}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? "Sending…" : rows.length > 1 ? "Send invites" : "Send invite"}
      </button>
    </form>
  );
}
