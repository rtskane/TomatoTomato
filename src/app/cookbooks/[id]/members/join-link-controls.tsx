"use client";

import {
  startTransition,
  useActionState,
  useState,
  useSyncExternalStore,
} from "react";
import type { JoinLinkState } from "./actions";
import type { JoinLinkView } from "@/server/services/member.service";
import type { GrantableRole } from "@/lib/invite";

// The owner's controls for "anyone with this link can join", laid out the way
// Google Docs lays out its general-access setting: a switch, the role the link
// grants, the link itself to copy, and a way to kill it if it travels too far.
//
// Every control dispatches its action by hand rather than submitting a <form>,
// for the reason RoleRow documents: React resets a form once its action
// completes, which snapped auto-submitting controls back to their old value
// and made a write that had landed look like it hadn't.

type LinkAction = (
  state: JoinLinkState,
  formData: FormData,
) => Promise<JoinLinkState>;

const initialState: JoinLinkState = {};

const ROLE_LABELS: Record<GrantableRole, string> = {
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

const selectClass =
  "rounded-lg border border-border bg-background-control px-2 py-1 text-subheadline " +
  "outline-none focus:border-border-input-strong disabled:opacity-50";

const noSubscription = () => () => {};

/**
 * The page's own origin. The server can't know which host the owner reached
 * the app on (preview, production, localhost), and the link has to be the one
 * they can actually send — so it's read in the browser. The server snapshot is
 * empty, and React swaps in the real origin after hydration without a mismatch.
 */
function useOrigin() {
  return useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => "",
  );
}

export default function JoinLinkControls({
  link,
  setEnabledAction,
  setRoleAction,
  resetAction,
}: {
  link: JoinLinkView;
  setEnabledAction: LinkAction;
  setRoleAction: LinkAction;
  resetAction: LinkAction;
}) {
  const [enabledState, submitEnabled, enabledPending] = useActionState(
    setEnabledAction,
    initialState,
  );
  const [roleState, submitRole, rolePending] = useActionState(
    setRoleAction,
    initialState,
  );
  const [resetState, submitReset, resetPending] = useActionState(
    resetAction,
    initialState,
  );
  const pending = enabledPending || rolePending || resetPending;
  const error = enabledState.error ?? roleState.error ?? resetState.error;

  // The link as last confirmed, from the page or from whichever action
  // answered most recently. The role select is also optimistic, and rolls back
  // to this when a change is refused.
  const [current, setCurrent] = useState(link);
  const [selectedRole, setSelectedRole] = useState(link.role);

  // Re-sync during render — React's documented way to follow a changing prop —
  // whenever the page re-renders with new data or an action reports back.
  const [synced, setSynced] = useState({ link, enabledState, roleState, resetState });
  if (
    synced.link !== link ||
    synced.enabledState !== enabledState ||
    synced.roleState !== roleState ||
    synced.resetState !== resetState
  ) {
    const answered =
      (synced.resetState !== resetState && resetState.link) ||
      (synced.roleState !== roleState && roleState.link) ||
      (synced.enabledState !== enabledState && enabledState.link) ||
      (synced.link !== link && link) ||
      current;
    setSynced({ link, enabledState, roleState, resetState });
    setCurrent(answered);
    setSelectedRole(answered.role);
  }

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const origin = useOrigin();

  const enabled = current.token !== null;
  const url = current.token ? `${origin}/join/${current.token}` : "";

  function dispatch(submit: (formData: FormData) => void, fields: Record<string, string> = {}) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(() => submit(formData));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission (or an insecure origin): the link is still on
      // screen in a selectable field, so fall back to selecting it for them.
      document.getElementById("join-link-url")?.focus();
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id="join-link-heading" className="text-subheadline font-medium">
            Invite link
          </h3>
          <p className="mt-0.5 text-caption-1 text-foreground-tertiary">
            {enabled
              ? "Anyone with the link can join. Share it with people you trust."
              : "Off. Only people you invite by name can join."}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="join-link-heading"
          disabled={pending}
          onClick={() =>
            dispatch(submitEnabled, { enabled: String(!enabled) })
          }
          className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-accent" : "bg-border-strong"
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform ${
              enabled ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      {enabled ? (
        <div className="mt-3 space-y-3">
          <label className="flex flex-wrap items-center gap-2 text-subheadline">
            <span>Anyone with the link can join as</span>
            <select
              value={selectedRole}
              disabled={pending}
              onChange={(e) => {
                const role = e.target.value as GrantableRole;
                setSelectedRole(role);
                dispatch(submitRole, { role });
              }}
              className={selectClass}
            >
              {(Object.keys(ROLE_LABELS) as GrantableRole[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <input
              id="join-link-url"
              readOnly
              value={url}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background-control px-3 py-1.5 text-caption-1 text-foreground-secondary outline-none focus:border-border-input-strong"
            />
            <button
              type="button"
              onClick={copy}
              disabled={!url}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-subheadline font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          {/* Announced separately: the button's own text changing isn't
              reliably read out while focus stays on it. */}
          <p role="status" className="sr-only">
            {copied ? "Link copied" : ""}
          </p>

          {confirmingReset ? (
            <div className="rounded-lg border border-border bg-background-secondary px-3 py-2.5">
              <p className="text-caption-1 text-foreground-secondary">
                The current link will stop working. Anyone who already joined
                stays in.
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setConfirmingReset(false);
                    dispatch(submitReset);
                  }}
                  className="text-caption-1 font-medium text-error hover:underline disabled:opacity-50"
                >
                  Reset link
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="text-caption-1 text-foreground-secondary hover:underline"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmingReset(true)}
              className="text-caption-1 text-foreground-secondary hover:underline disabled:opacity-50"
            >
              Reset link
            </button>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-caption-1 text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
