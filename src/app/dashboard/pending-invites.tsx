"use client";

import { useActionState } from "react";
import type { InviteResponseState } from "./actions";
import type { PendingInviteSummary } from "@/server/services/member.service";

// Presentational: props in, markup out. Renders nothing at all when there's
// nothing pending, so the container never has to branch.

type ResponseAction = (
  state: InviteResponseState,
  formData: FormData,
) => Promise<InviteResponseState>;

const initialState: InviteResponseState = {};

function InviteCard({
  invite,
  acceptAction,
  declineAction,
}: {
  invite: PendingInviteSummary;
  acceptAction: ResponseAction;
  declineAction: ResponseAction;
}) {
  const [acceptState, accept, accepting] = useActionState(
    acceptAction,
    initialState,
  );
  const [declineState, decline, declining] = useActionState(
    declineAction,
    initialState,
  );

  const busy = accepting || declining;
  const error = acceptState.error ?? declineState.error;

  return (
    <li className="rounded-lg border border-border p-4">
      <p className="font-medium">{invite.cookbookTitle}</p>
      <p className="mt-1 text-subheadline text-foreground-secondary">
        {invite.invitedByName} invited you as{" "}
        {invite.role === "EDITOR" ? "an editor" : "a viewer"}.
      </p>
      {invite.cookbookDescription ? (
        <p className="mt-1 line-clamp-2 text-subheadline text-foreground-tertiary">
          {invite.cookbookDescription}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-subheadline text-error">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <form action={accept}>
          <input type="hidden" name="inviteId" value={invite.id} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-subheadline font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {accepting ? "Joining…" : "Accept"}
          </button>
        </form>
        <form action={decline}>
          <input type="hidden" name="inviteId" value={invite.id} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-subheadline text-foreground-secondary hover:bg-background-secondary disabled:opacity-60"
          >
            Decline
          </button>
        </form>
      </div>
    </li>
  );
}

export default function PendingInvites({
  invites,
  acceptAction,
  declineAction,
}: {
  invites: PendingInviteSummary[];
  acceptAction: ResponseAction;
  declineAction: ResponseAction;
}) {
  if (invites.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-subheadline font-medium">You&rsquo;ve been invited</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {invites.map((invite) => (
          <InviteCard
            key={invite.id}
            invite={invite}
            acceptAction={acceptAction}
            declineAction={declineAction}
          />
        ))}
      </ul>
    </section>
  );
}
