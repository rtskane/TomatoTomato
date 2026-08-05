"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import type { CreateCookbookState } from "./actions";

const initialState: CreateCookbookState = {};

type CreateCookbookAction = (
  state: CreateCookbookState,
  formData: FormData,
) => Promise<CreateCookbookState>;

// Presentational: props in, markup out. Owns no data — the action is supplied
// by the container. Its job is a semantic, accessible form.
export default function CookbookForm({
  action,
}: {
  action: CreateCookbookAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const titleRef = useRef<HTMLInputElement>(null);

  // Move focus to the field that needs attention when the server rejects.
  useEffect(() => {
    if (state.error) titleRef.current?.focus();
  }, [state]);

  const fieldClass =
    "mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 " +
    "outline-none focus:border-red-500 dark:border-white/20";

  const hasError = Boolean(state.error);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Title
        </label>
        <input
          ref={titleRef}
          id="title"
          name="title"
          required
          placeholder="Weeknight Dinners"
          defaultValue={state.values?.title}
          className={fieldClass}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "title-error" : undefined}
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Description <span className="font-normal text-black/50 dark:text-white/50">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Fast meals for busy nights."
          defaultValue={state.values?.description}
          className={fieldClass}
          aria-describedby="description-hint"
        />
        <p
          id="description-hint"
          className="mt-1 text-xs text-black/50 dark:text-white/50"
        >
          500 characters or fewer.
        </p>
      </div>

      {hasError ? (
        <p id="title-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create cookbook"}
        </button>
        <Link
          href="/dashboard"
          className="text-sm text-black/60 hover:underline dark:text-white/60"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
