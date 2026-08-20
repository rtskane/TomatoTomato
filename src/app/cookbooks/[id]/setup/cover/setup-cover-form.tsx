"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import CoverDesigner from "@/components/cover-designer";
import type { CoverDesign } from "@/lib/book-covers";
import type { SetupCoverState } from "../actions";

type SaveAction = (
  state: SetupCoverState,
  formData: FormData,
) => Promise<SetupCoverState>;

// Presentational: the designer plus the two ways out of this step. The
// designer owns the design itself; this only owns whether an upload is in
// flight, which is the one thing that has to stop the submit.
export default function SetupCoverForm({
  title,
  design,
  action,
  skipHref,
}: {
  title: string;
  design: CoverDesign;
  action: SaveAction;
  skipHref: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const [uploading, setUploading] = useState(false);

  return (
    <form action={submit} className="space-y-8">
      <CoverDesigner
        title={title}
        design={design}
        onUploadingChange={setUploading}
        // More room than the settings dialog can give it: this screen has the
        // page to itself, and the cover is the whole subject of it.
        previewClassName="w-40 sm:w-52"
      />

      {state.error ? (
        <p role="alert" className="text-subheadline text-error">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          // Submitting mid-upload would save the cookbook without the picture
          // the owner just chose, with nothing to show why.
          disabled={pending || uploading}
          className="rounded-md bg-accent px-4 py-2 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save and continue"}
        </button>

        {/* A real link, not a submit: skipping means "don't write anything",
            so it must not go through the action at all. */}
        <Link
          href={skipHref}
          className="text-subheadline text-foreground-secondary hover:underline"
        >
          Skip for now
        </Link>
      </div>
    </form>
  );
}
