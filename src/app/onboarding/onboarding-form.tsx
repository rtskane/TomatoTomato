"use client";

import { useActionState, useEffect, useRef } from "react";
import type { OnboardingState } from "./actions";

const initialState: OnboardingState = {};

type OnboardingAction = (
  state: OnboardingState,
  formData: FormData,
) => Promise<OnboardingState>;

// Presentational: props in, markup out. Owns no data — the action and defaults
// are supplied by the container. Its job is a semantic, accessible form.
export default function OnboardingForm({
  action,
  defaultFirstName,
  defaultLastName,
}: {
  action: OnboardingAction;
  defaultFirstName?: string;
  defaultLastName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Move focus to the field that needs attention when the server rejects.
  useEffect(() => {
    if (state.error) usernameRef.current?.focus();
  }, [state]);

  const inputClass =
    "mt-1 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 " +
    "outline-none focus:border-red-500 dark:border-white/20";

  const hasError = Boolean(state.error);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <div>
        <label htmlFor="username" className="block text-sm font-medium">
          Username
        </label>
        <input
          ref={usernameRef}
          id="username"
          name="username"
          required
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="chef_ryan"
          defaultValue={state.values?.username}
          className={inputClass}
          aria-invalid={hasError || undefined}
          aria-describedby={
            hasError ? "username-error username-hint" : "username-hint"
          }
        />
        <p
          id="username-hint"
          className="mt-1 text-xs text-black/50 dark:text-white/50"
        >
          3–20 characters. Letters, numbers, and underscores; starts with a
          letter.
        </p>
      </div>

      <fieldset className="min-w-0">
        <legend className="text-sm font-medium">Your name (optional)</legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="sr-only">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              placeholder="First"
              defaultValue={state.values?.firstName ?? defaultFirstName}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lastName" className="sr-only">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              placeholder="Last"
              defaultValue={state.values?.lastName ?? defaultLastName}
              className={inputClass}
            />
          </div>
        </div>
      </fieldset>

      {hasError ? (
        <p id="username-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
