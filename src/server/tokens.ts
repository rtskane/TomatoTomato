import { randomBytes } from "node:crypto";

/**
 * A secret for a URL: 256 bits of entropy, base64url so it needs no escaping.
 * Shared by invite tokens and cookbook join links — anything a link-holder
 * proves they were given by presenting it.
 */
export function newUrlToken(): string {
  return randomBytes(32).toString("base64url");
}
