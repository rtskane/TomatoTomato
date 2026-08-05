import { z } from "zod";

// Handles that would collide with real or future routes, or read as system
// accounts. Compared against the normalized (lowercased) username.
const RESERVED = new Set([
  "admin",
  "administrator",
  "root",
  "api",
  "app",
  "onboarding",
  "dashboard",
  "settings",
  "sign-in",
  "signin",
  "sign-up",
  "signup",
  "about",
  "help",
  "support",
  "me",
  "user",
  "users",
  "null",
  "undefined",
  "tomato",
]);

// Normalize before validating/storing so "Ryan", "ryan", and " ryan " are the
// same handle. Usernames are stored lowercased.
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

// 3–20 chars, letters/numbers/underscore, must start with a letter. Applied to
// the already-normalized value.
export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(3, "Username must be at least 3 characters.")
      .max(20, "Username must be 20 characters or fewer.")
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Use letters, numbers, and underscores; start with a letter.",
      )
      .refine((v) => !RESERVED.has(v), "That username isn't available."),
  );

// Optional free-text name field: trims, caps length, empty → undefined so we
// store null rather than "".
export const optionalNameSchema = z
  .string()
  .trim()
  .max(50, "That's too long.")
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const onboardingSchema = z.object({
  username: usernameSchema,
  firstName: optionalNameSchema,
  lastName: optionalNameSchema,
});
