"use client";

import { startTransition, useActionState } from "react";
import type { MemberActionState, OneTimeLinkState } from "./actions";
import type { OneTimeLinkView } from "@/server/services/member.service";
import {
  GRANTABLE_ROLE_LABELS,
  ONE_TIME_LINK_LABEL_MAX,
  ONE_TIME_LINK_TTL_DAYS,
  type GrantableRole,
} from "@/lib/invite";
import { CopyLinkButton, useJoinUrl } from "./copy-link";
import { controlClass } from "./control-classes";

// Links that let one person in, once — for when the cookbook's shared link is
// more open than the owner wants. Each is made for someone ("Mum"), copied,
// sent, and spent by whoever uses it first; unused ones stay listed here, to
// copy again or revoke, until they expire.

type CreateAction = (
  state: OneTimeLinkState,
  formData: FormData,
) => Promise<OneTimeLinkState>;

type RevokeAction = (
  state: MemberActionState,
  formData: FormData,
) => Promise<MemberActionState>;

function expiryText(daysLeft: number) {
  return daysLeft <= 1 ? "expires within a day" : `expires in ${daysLeft} days`;
}

function OneTimeLinkRow({
  link,
  isNew,
  revokeAction,
}: {
  link: OneTimeLinkView;
  isNew: boolean;
  revokeAction: RevokeAction;
}) {
  const [state, submitRevoke, pending] = useActionState(revokeAction, {});
  const url = useJoinUrl(link.token);
  const name = link.label ?? "One-time link";

  return (
    <li className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-subheadline font-medium">
          {name}
          {isNew ? (
            <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-caption-2 font-medium text-on-accent">
              New
            </span>
          ) : null}
        </p>
        <p className="text-caption-1 text-foreground-tertiary">
          {GRANTABLE_ROLE_LABELS[link.role]} · {expiryText(link.daysLeft)}
        </p>
        {state.error ? (
          <p role="alert" className="text-caption-1 text-error">
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <CopyLinkButton url={url} label={`link for ${name}`} />
        {/* Dispatched by hand rather than as a <form>, like RoleRow's
            controls: the row is about to disappear, and a form reset
            racing that is only noise. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const formData = new FormData();
            formData.set("linkId", link.id);
            startTransition(() => submitRevoke(formData));
          }}
          aria-label={`Revoke link for ${name}`}
          className="rounded-md px-2 py-1 text-caption-1 text-foreground-secondary hover:underline disabled:opacity-50"
        >
          Revoke
        </button>
      </div>
    </li>
  );
}

export default function OneTimeLinks({
  links,
  createAction,
  revokeAction,
}: {
  links: OneTimeLinkView[];
  createAction: CreateAction;
  revokeAction: RevokeAction;
}) {
  const [state, formAction, pending] = useActionState(createAction, {});

  return (
    <div>
      <h3 className="text-subheadline font-medium">One-time links</h3>
      <p className="mt-0.5 text-caption-1 text-foreground-tertiary">
        Each lets one person in, once. Unused links stop working after{" "}
        {ONE_TIME_LINK_TTL_DAYS} days.
      </p>

      {/* A real <form>: after creating a link, React emptying the label field
          is exactly what's wanted — it's ready for the next person. */}
      <form action={formAction} className="mt-3 flex flex-wrap gap-2">
        <input
          name="label"
          maxLength={ONE_TIME_LINK_LABEL_MAX}
          placeholder="Who's it for? (optional)"
          aria-label="Who the link is for"
          className={`min-w-0 flex-1 ${controlClass} px-3 py-1.5`}
        />
        <select
          name="role"
          defaultValue="VIEWER"
          aria-label="Role for the new link"
          className={`${controlClass} py-1.5`}
        >
          {(Object.keys(GRANTABLE_ROLE_LABELS) as GrantableRole[]).map((role) => (
            <option key={role} value={role}>
              {GRANTABLE_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 text-subheadline font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create link"}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="mt-2 text-caption-1 text-error">
          {state.error}
        </p>
      ) : null}

      {links.length > 0 ? (
        <ul className="mt-2 divide-y divide-border-faint">
          {links.map((link) => (
            <OneTimeLinkRow
              key={link.id}
              link={link}
              isNew={link.id === state.created?.id}
              revokeAction={revokeAction}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
