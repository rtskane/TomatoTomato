"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CoverImageField from "@/components/cover-image-field";
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
  // The cover lives here rather than in the DOM: it is set by an upload that
  // finishes long after the field was rendered, and it has to survive the
  // re-render a rejected submit causes.
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Move focus to the field that needs attention when the server rejects.
  useEffect(() => {
    if (state.error) titleRef.current?.focus();
  }, [state]);

  const fieldClass =
    "mt-1 w-full rounded-md border border-border-strong bg-transparent px-3 py-2 " +
    "outline-none focus:border-border-input-strong";

  const hasError = Boolean(state.error);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <div>
        <label htmlFor="title" className="block text-subheadline font-medium">
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
        <label htmlFor="description" className="block text-subheadline font-medium">
          Description <span className="font-normal text-foreground-tertiary">(optional)</span>
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
          className="mt-1 text-caption-1 text-foreground-tertiary"
        >
          500 characters or fewer.
        </p>
      </div>

      <CoverImageField
        value={coverImageUrl}
        onChange={setCoverImageUrl}
        onUploadingChange={setUploading}
      />
      <input type="hidden" name="coverImageUrl" value={coverImageUrl} />

      {hasError ? (
        <p id="title-error" role="alert" className="text-subheadline text-error">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          // Submitting mid-upload would create the cookbook without the cover
          // the user just picked, with nothing to show why.
          disabled={pending || uploading}
          className="rounded-md bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create cookbook"}
        </button>
        <Link
          href="/dashboard"
          className="text-subheadline text-foreground-secondary hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
