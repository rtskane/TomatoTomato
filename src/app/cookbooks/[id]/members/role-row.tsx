"use client";

import { useActionState, useState, startTransition } from "react";
import type { MemberActionState } from "./actions";
import type { CookbookRole } from "@/generated/prisma/enums";

// One row of a people list, with the controls to re-role or remove whoever it
// names. Shared by accepted members and outstanding invites: the two differ
// only in which id they act on (`userId` vs `inviteId`) and what removal is
// called, so everything else — the auto-submitting select, the pending state,
// the error reporting — lives here once.

type RowAction = (
  state: MemberActionState,
  formData: FormData,
) => Promise<MemberActionState>;

const initialState: MemberActionState = {};

const selectClass =
  "rounded-lg border border-black/10 bg-black/[0.02] px-2 py-1 text-sm " +
  "outline-none focus:border-red-500 disabled:opacity-50 " +
  "dark:border-white/15 dark:bg-white/[0.04]";

function Avatar({ url, name }: { url: string | null; name: string }) {
  // A plain <img>, not next/image: `avatarUrl` is whatever host Clerk hands us
  // (its own CDN, or a passed-through Google/GitHub avatar), and next/image
  // would need every one of those allowlisted in next.config — a guess that
  // fails at runtime when it's wrong, for no real gain on a 32px thumbnail.
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="size-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-medium text-black/50 dark:bg-white/10 dark:text-white/50"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function RoleRow({
  name,
  sublabel,
  avatarUrl = null,
  idField,
  id,
  role,
  editable,
  changeRoleAction,
  removeAction,
  removeLabel,
}: {
  name: string;
  sublabel?: string;
  avatarUrl?: string | null;
  /** Which id the actions act on — `userId` for members, `inviteId` for invites. */
  idField: "userId" | "inviteId";
  id: string;
  role: CookbookRole;
  /** False for the owner and for anyone viewing without manage permission. */
  editable: boolean;
  changeRoleAction: RowAction;
  removeAction: RowAction;
  removeLabel: string;
}) {
  const [roleState, submitRole, rolePending] = useActionState(
    changeRoleAction,
    initialState,
  );
  const [removeState, submitRemove, removePending] = useActionState(
    removeAction,
    initialState,
  );
  const error = roleState.error ?? removeState.error;

  // ## Why the role select isn't in a <form>
  //
  // It used to be, submitting itself on change. That could never display the
  // result of its own mutation: React **resets a form once its action
  // completes**, which snapped the dropdown back to the role the row was
  // rendered with. The write had already succeeded, so the change looked like
  // it had silently failed. Making the value controlled didn't help either —
  // `form.reset()` rewrites the DOM directly, and React re-renders nothing
  // afterwards because its own state never changed.
  //
  // Dispatching the action by hand sidesteps the reset entirely. `useActionState`
  // returns a dispatch that can be called outside a form as long as it's inside
  // a transition, and FormData is easy enough to assemble ourselves.
  const [selected, setSelected] = useState<CookbookRole>(role);

  function changeRole(next: CookbookRole) {
    setSelected(next);
    const formData = new FormData();
    formData.set(idField, id);
    formData.set("role", next);
    startTransition(() => submitRole(formData));
  }

  // Re-sync from the server on anything it tells us: a changed `role` means the
  // write landed, and a changed error means it didn't and the optimistic value
  // has to be rolled back. Done during render — React's documented way to
  // adjust state when a prop changes — rather than in an effect, which would
  // commit the stale value first and visibly flicker.
  const [synced, setSynced] = useState({ role, error: roleState.error });
  if (synced.role !== role || synced.error !== roleState.error) {
    setSynced({ role, error: roleState.error });
    setSelected(role);
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar url={avatarUrl} name={name} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {sublabel ? (
          <p className="truncate text-xs text-black/50 dark:text-white/50">
            {sublabel}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      {editable ? (
        <>
          <select
            name="role"
            value={selected}
            disabled={rolePending || removePending}
            aria-label={`Role for ${name}`}
            // Applying on change avoids a Save button per row.
            onChange={(e) => changeRole(e.target.value as CookbookRole)}
            className={selectClass}
          >
            <option value="VIEWER">Viewer</option>
            <option value="EDITOR">Editor</option>
          </select>

          {/* Removal stays a real form: it's a submit button, so it still works
              without JavaScript, and there's no value left to reset afterwards. */}
          <form action={submitRemove}>
            <input type="hidden" name={idField} value={id} />
            <button
              type="submit"
              disabled={rolePending || removePending}
              aria-label={`${removeLabel} ${name}`}
              className="rounded-md px-2 py-1 text-sm text-black/40 hover:bg-black/5 hover:text-red-600 disabled:opacity-40 dark:text-white/40 dark:hover:bg-white/10"
            >
              {removePending ? "…" : removeLabel}
            </button>
          </form>
        </>
      ) : (
        <span className="text-xs text-black/50 dark:text-white/50">
          {role.charAt(0) + role.slice(1).toLowerCase()}
        </span>
      )}
    </li>
  );
}
