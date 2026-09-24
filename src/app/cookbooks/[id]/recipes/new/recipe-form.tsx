"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ImageUploadField from "@/components/image-upload-field";
import type { RecipeSource } from "@/lib/recipe";
import type { CreateRecipeState, CreateRecipeValues } from "../recipe-form-data";
import IngredientEditor, { type IngredientItem } from "./ingredient-editor";
import StepEditor, { type StepItem } from "./step-editor";
import { fieldClass, primaryButtonClass } from "./form-classes";

const initialState: CreateRecipeState = {};

export type RecipeFormAction = (
  state: CreateRecipeState,
  formData: FormData,
) => Promise<CreateRecipeState>;

// Keys only need to be unique within a session, and they never leave the
// client — a counter is enough, and unlike an array index it survives removals
// without React reusing the wrong DOM node.
let nextKey = 0;
const takeKey = () => nextKey++;

export default function RecipeForm({
  action,
  cookbookId,
  /**
   * Seeds the form when editing. Absent when creating, which is what makes the
   * two uses the same component: an empty recipe and an existing one differ
   * only in what the fields start out holding.
   */
  initialValues,
  /**
   * Which way in produced this recipe, submitted with it so the save can
   * record it. Only the creator passes one; an edit has nothing to say here.
   */
  source,
  submitLabel = "Save recipe",
  pendingLabel = "Saving…",
}: {
  action: RecipeFormAction;
  cookbookId: string;
  initialValues?: CreateRecipeValues;
  source?: RecipeSource;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const titleRef = useRef<HTMLInputElement>(null);

  const [ingredients, setIngredients] = useState<IngredientItem[]>(() =>
    (initialValues?.ingredients ?? []).map((i) => ({ ...i, key: takeKey() })),
  );
  const [steps, setSteps] = useState<StepItem[]>(() =>
    (initialValues?.steps ?? []).map((instruction) => ({
      key: takeKey(),
      instruction,
    })),
  );

  // When the server rejects, it echoes back everything the user typed. Rebuild
  // the lists from that echo so a validation error never costs someone their
  // recipe. Done during render — React's documented way to adjust state when a
  // prop changes — rather than in an effect, which would cost an extra commit
  // and flash the stale list.
  // Held in state, unlike the text fields, because the upload field hands back
  // a URL rather than typing into an input. That also means it survives React
  // resetting the form after a rejected save, with no echo needed to re-seed it.
  const [photoUrl, setPhotoUrl] = useState(initialValues?.coverImageUrl ?? "");
  // Saving mid-upload would store the recipe without the photo just chosen.
  const [photoUploading, setPhotoUploading] = useState(false);

  const [echoed, setEchoed] = useState(state.values);
  if (state.values !== echoed) {
    setEchoed(state.values);
    if (state.values) {
      setIngredients(
        state.values.ingredients.map((i) => ({ ...i, key: takeKey() })),
      );
      setSteps(
        state.values.steps.map((instruction) => ({
          key: takeKey(),
          instruction,
        })),
      );
    }
  }

  // Focus is a DOM side effect, so it does belong in an effect.
  useEffect(() => {
    if (state.error) titleRef.current?.focus();
  }, [state]);

  // The server's echo wins when there is one (it holds what the user just
  // typed); otherwise fall back to what we were seeded with.
  const v = (field: keyof CreateRecipeValues) => {
    const echo = state.values?.[field];
    if (typeof echo === "string") return echo;
    const seed = initialValues?.[field];
    return typeof seed === "string" ? seed : undefined;
  };

  const hasError = Boolean(state.error);

  return (
    <form action={formAction} className="space-y-10" noValidate>
      {source ? <input type="hidden" name="source" value={source} /> : null}
      <section className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-subheadline font-medium">
            Title
          </label>
          <input
            ref={titleRef}
            id="title"
            name="title"
            required
            placeholder="Weeknight carbonara"
            defaultValue={v("title")}
            className={`mt-1 ${fieldClass}`}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? "recipe-error" : undefined}
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-subheadline font-medium">
            Description{" "}
            <span className="font-normal text-foreground-muted">
              optional
            </span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={v("description")}
            className={`mt-1 resize-none ${fieldClass}`}
          />
        </div>

        <div>
          {/* The form's own label style, not the field's, so "optional" reads
              the same here as on the description above it. */}
          <span className="block text-subheadline font-medium">
            Photo{" "}
            <span className="font-normal text-foreground-muted">optional</span>
          </span>
          <div className="mt-2">
            <ImageUploadField
              folder="recipe-photos"
              heading={null}
              value={photoUrl}
              onChange={setPhotoUrl}
              onUploadingChange={setPhotoUploading}
            />
          </div>
        </div>
        <input type="hidden" name="coverImageUrl" value={photoUrl} />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="servings" className="block text-subheadline font-medium">
              Serves
            </label>
            <input
              id="servings"
              name="servings"
              inputMode="numeric"
              placeholder="4"
              defaultValue={v("servings")}
              className={`mt-1 ${fieldClass}`}
            />
          </div>
          <div>
            <label
              htmlFor="prepTimeMinutes"
              className="block text-subheadline font-medium"
            >
              Prep (min)
            </label>
            <input
              id="prepTimeMinutes"
              name="prepTimeMinutes"
              inputMode="numeric"
              placeholder="15"
              defaultValue={v("prepTimeMinutes")}
              className={`mt-1 ${fieldClass}`}
            />
          </div>
          <div>
            <label
              htmlFor="cookTimeMinutes"
              className="block text-subheadline font-medium"
            >
              Cook (min)
            </label>
            <input
              id="cookTimeMinutes"
              name="cookTimeMinutes"
              inputMode="numeric"
              placeholder="20"
              defaultValue={v("cookTimeMinutes")}
              className={`mt-1 ${fieldClass}`}
            />
          </div>
        </div>
      </section>

      <IngredientEditor items={ingredients} onChange={setIngredients} />
      <StepEditor items={steps} onChange={setSteps} />

      {hasError ? (
        <p id="recipe-error" role="alert" className="text-subheadline text-error">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || photoUploading}
          className={primaryButtonClass}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        <Link
          href={`/cookbooks/${cookbookId}`}
          className="text-subheadline text-foreground-secondary hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
