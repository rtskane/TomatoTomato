import { z } from "zod";

// The rules for the links that let people into a cookbook. Lives in lib/ (not
// the service) so the same rules are importable from anywhere — including the
// client, which shows how long a one-time link lasts.

/**
 * The roles a link may grant.
 *
 * OWNER is deliberately absent: `Cookbook.ownerId` is a scalar column, so a
 * second OWNER membership row would contradict it. Transferring ownership is a
 * separate operation, not something a link should be able to do sideways.
 */
export const grantableRoleSchema = z.enum(["EDITOR", "VIEWER"], {
  message: "Pick a role of editor or viewer.",
});

export type GrantableRole = z.infer<typeof grantableRoleSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long an unused one-time link keeps working. Short on purpose: a link
 * works for whoever has it, so the window in which a forwarded or overheard
 * one is useful stays small.
 */
export const ONE_TIME_LINK_TTL_DAYS = 7;

export function oneTimeLinkExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + ONE_TIME_LINK_TTL_DAYS * DAY_MS);
}

/**
 * Whole days until `expiresAt`, rounded up and never below 1 — so a link with
 * hours left reads "1 day" rather than "0 days", which would sound expired.
 */
export function daysLeft(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));
}

/**
 * The owner's note on a one-time link, so a list of them can be told apart —
 * "Mum", "Uncle J". Optional: empty means no label.
 */
export const oneTimeLinkLabelSchema = z
  .string()
  .trim()
  .max(40, "Keep the label under 40 characters.")
  .transform((v) => (v === "" ? null : v));
