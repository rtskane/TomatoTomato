"use client";

import { useActionState } from "react";
import type { JoinState } from "./actions";

type JoinAction = (state: JoinState, formData: FormData) => Promise<JoinState>;

const initialState: JoinState = {};

/**
 * The one control on the join page. Joining is a button press rather than
 * something opening the link does by itself: a GET that changes who can see a
 * cookbook could be triggered by a link preview or an image tag, without the
 * person ever choosing to join.
 */
export default function JoinButton({
  action,
  label,
}: {
  action: JoinAction;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Joining…" : label}
      </button>
      {state.error ? (
        <p role="alert" className="mt-3 text-subheadline text-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
