import { z } from "zod";
import { usernameSchema } from "@/lib/username";

// Validation for invites. Lives in lib/ (not the service) so the same rules are
// importable from anywhere — including, later, a client-side check.

/**
 * The roles an invite may grant.
 *
 * OWNER is deliberately absent: `Cookbook.ownerId` is a scalar column, so a
 * second OWNER membership row would contradict it. Transferring ownership is a
 * separate operation, not something an invite should be able to do sideways.
 */
export const grantableRoleSchema = z.enum(["EDITOR", "VIEWER"], {
  message: "Pick a role of editor or viewer.",
});

export type GrantableRole = z.infer<typeof grantableRoleSchema>;

/**
 * One row of the invite form: a username and the role to grant them.
 *
 * Reuses `usernameSchema`, so what the inviter types is normalized exactly the
 * way the invitee's own handle was at onboarding — "  Ryan " finds `ryan`.
 */
export const inviteRowSchema = z.object({
  username: usernameSchema,
  role: grantableRoleSchema,
});

/** How long an invite stays valid before it's treated as expired. */
export const INVITE_TTL_DAYS = 30;

export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
