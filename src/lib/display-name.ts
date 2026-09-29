/**
 * How a person is labelled in the UI.
 *
 * Prefer the handle, fall back to a real name, then to something neutral —
 * `username` is null until onboarding completes and the name fields are always
 * optional, so none of these is guaranteed on its own. Shared by recipe authors
 * and cookbook members so the same person never reads two different ways.
 */
export function displayName(user: {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  if (user.username) return user.username;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return name || "Unknown";
}

/**
 * How a recipe's author is labelled — `displayName`, or "a former member" once
 * they've deleted their account and left the recipe behind. Lower case because
 * it only ever follows "by".
 */
export function authorName(
  author: Parameters<typeof displayName>[0] | null,
): string {
  return author ? displayName(author) : "a former member";
}
