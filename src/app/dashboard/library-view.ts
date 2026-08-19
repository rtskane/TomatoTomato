/**
 * How the dashboard library is laid out — and how that choice survives a
 * reload.
 *
 * The preference lives in a cookie rather than localStorage so the *server*
 * can read it and render the right view on the first paint. localStorage is
 * only readable after hydration, which would mean everyone who prefers the
 * list watching a shelf of books flash past first.
 *
 * It is written from the client (see cookbook-library.tsx) rather than by a
 * server action: flipping a view is not a mutation, and it shouldn't cost a
 * round trip. Nothing on the server trusts this value beyond `parseLibraryView`
 * below, which treats anything unrecognised as the default.
 */

export type LibraryView = "books" | "list";

export const LIBRARY_VIEW_COOKIE = "library-view";

/** Books unless the reader has said otherwise. */
export const DEFAULT_LIBRARY_VIEW: LibraryView = "books";

/** A year in seconds — a view preference should outlast a browser restart. */
export const LIBRARY_VIEW_MAX_AGE = 60 * 60 * 24 * 365;

export function parseLibraryView(value: string | undefined): LibraryView {
  return value === "list" || value === "books" ? value : DEFAULT_LIBRARY_VIEW;
}
