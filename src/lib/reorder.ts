/**
 * Move one item of a list to a new index, returning a new array.
 *
 * Shared by every reordering affordance — drag, and the up/down buttons — so
 * the ordering rules are defined once and tested without any pointer events.
 * Out-of-range indices are a no-op rather than an error: the up button on the
 * first row and the down button on the last should simply do nothing.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...list];
  if (from < 0 || from >= list.length) return [...list];
  if (to < 0 || to >= list.length) return [...list];

  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
