"use client";

import { useActionState, useState } from "react";
import RecipeForm, { type RecipeFormAction } from "./recipe-form";
import type { CreateRecipeValues } from "../recipe-form-data";
import type { ImportState } from "./import-actions";
import { fieldClass, primaryButtonClass } from "./form-classes";

// Three ways to start a recipe, one recipe at the end of them.
//
// Whichever route someone takes, they arrive at the same form holding the same
// shape, and the same action saves it. An importer's only job is to fill that
// form in — it never saves, so a bad parse costs a moment rather than a bad
// recipe, and the page that displays recipes never has to know how any of them
// got here.

type ImportAction = (
  state: ImportState,
  formData: FormData,
) => Promise<ImportState>;

type Mode = "choose" | "form" | "paste" | "link";

const CHOICES: {
  mode: Mode;
  title: string;
  blurb: string;
  icon: string;
}[] = [
  {
    mode: "form",
    title: "Fill in the form",
    blurb: "Type it out field by field.",
    icon: "✎",
  },
  {
    mode: "paste",
    title: "Paste a recipe",
    blurb: "From an email, a note, a message — however it's written.",
    icon: "⧉",
  },
  {
    mode: "link",
    title: "From a link",
    blurb: "Paste a link and we'll read the recipe off the page.",
    icon: "↗",
  },
];

/**
 * Run `onImport` once for each new set of values an import action returns.
 *
 * Done during render rather than in an effect — the same pattern RecipeForm
 * already uses to absorb an echoed-back submission — so the form appears in the
 * same commit as the values, with no flash of the empty importer behind it.
 */
function useOnImport(
  values: CreateRecipeValues | undefined,
  onImport: (values: CreateRecipeValues) => void,
) {
  const [seen, setSeen] = useState(values);
  if (values !== seen) {
    setSeen(values);
    if (values) onImport(values);
  }
}

/** The shared frame for an importer: a heading, the input, and a way back. */
function ImportPanel({
  title,
  hint,
  error,
  pending,
  submitLabel,
  onBack,
  children,
}: {
  title: string;
  hint: string;
  error?: string;
  pending: boolean;
  submitLabel: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-title-3">{title}</h2>
      <p className="mt-1 text-subheadline text-foreground-secondary">{hint}</p>

      <div className="mt-4 space-y-3">
        {children}

        {error ? (
          <p role="alert" className="text-subheadline text-error">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Reading…" : submitLabel}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="text-subheadline text-foreground-secondary hover:underline"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecipeCreator({
  cookbookId,
  saveAction,
  importTextAction,
  importUrlAction,
}: {
  cookbookId: string;
  saveAction: RecipeFormAction;
  importTextAction: ImportAction;
  importUrlAction: ImportAction;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [imported, setImported] = useState<CreateRecipeValues | undefined>();

  const [textState, textFormAction, textPending] = useActionState(
    importTextAction,
    {} as ImportState,
  );
  const [urlState, urlFormAction, urlPending] = useActionState(
    importUrlAction,
    {} as ImportState,
  );

  // An import that succeeded is a form waiting to be checked — but only if the
  // author is still waiting on it. Someone who backed out while it was reading
  // may be typing into the blank form by now, and an import landing on top of
  // that would overwrite their work. (It also keeps the form's one-time
  // seeding honest: the form is only ever mounted fresh from a panel, so it
  // never needs a key to notice new values.)
  const showImportedFrom = (panel: Mode) => (values: CreateRecipeValues) => {
    if (mode !== panel) return;
    setImported(values);
    setMode("form");
  };
  useOnImport(textState.values, showImportedFrom("paste"));
  useOnImport(urlState.values, showImportedFrom("link"));

  function backToChoices() {
    setMode("choose");
    setImported(undefined);
  }

  if (mode === "choose") {
    return (
      <div>
        <ul className="space-y-3">
          {CHOICES.map((choice) => (
            <li key={choice.mode}>
              <button
                type="button"
                onClick={() => setMode(choice.mode)}
                className="flex w-full items-start gap-4 rounded-xl border border-border bg-background-control px-4 py-4 text-left hover:border-border-strong hover:bg-background-secondary"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 font-serif text-title-3 text-accent-ink"
                >
                  {choice.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{choice.title}</span>
                  <span className="mt-0.5 block text-subheadline text-foreground-secondary">
                    {choice.blurb}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-caption-1 text-foreground-tertiary">
          However you add it, you&rsquo;ll get a chance to check it over before
          it&rsquo;s saved.
        </p>
      </div>
    );
  }

  if (mode === "paste") {
    return (
      <form action={textFormAction}>
        <ImportPanel
          title="Paste a recipe"
          hint="However it's written. If you've headed the parts “Ingredients” and “Method”, we'll follow that; otherwise we'll work it out and you can correct us."
          error={textState.error}
          pending={textPending}
          submitLabel="Read it"
          onBack={backToChoices}
        >
          <textarea
            name="text"
            rows={14}
            autoFocus
            // Re-seeded from the echo so a failed import doesn't swallow the
            // recipe the user just pasted — React empties the field otherwise.
            defaultValue={textState.submitted}
            placeholder={
              "Weeknight Carbonara\n\nIngredients\n200g spaghetti\n2 eggs\nBlack pepper\n\nMethod\nBoil the pasta.\nStir the eggs through off the heat."
            }
            className={`${fieldClass} resize-y font-mono text-subheadline`}
          />
        </ImportPanel>
      </form>
    );
  }

  if (mode === "link") {
    return (
      <form action={urlFormAction}>
        <ImportPanel
          title="From a link"
          hint="We read the recipe the site publishes for search engines. Some sites won't let us — if yours won't, paste the recipe instead."
          error={urlState.error}
          pending={urlPending}
          submitLabel="Read it"
          onBack={backToChoices}
        >
          <input
            name="url"
            type="url"
            autoFocus
            defaultValue={urlState.submitted}
            inputMode="url"
            placeholder="https://example.com/recipes/carbonara"
            className={fieldClass}
          />
        </ImportPanel>
      </form>
    );
  }

  return (
    <div>
      {imported ? (
        <div className="mb-6 rounded-lg border border-border bg-background-secondary px-4 py-3">
          <p className="text-subheadline font-medium">
            Here&rsquo;s what we made of it.
          </p>
          <p className="mt-1 text-subheadline text-foreground-secondary">
            Check it over — nothing is saved until you say so.{" "}
            <button
              type="button"
              onClick={backToChoices}
              className="underline hover:no-underline"
            >
              Start over
            </button>
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={backToChoices}
          className="mb-6 text-subheadline text-foreground-secondary hover:underline"
        >
          ← Choose a different way
        </button>
      )}

      <RecipeForm
        action={saveAction}
        cookbookId={cookbookId}
        initialValues={imported}
      />
    </div>
  );
}
