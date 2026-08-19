"use client";

import { useState } from "react";
import type { CookbookSummary } from "@/server/services/cookbook.service";
import CookbookList from "./cookbook-list";
import CookbookShelf from "./cookbook-shelf";
import {
  LIBRARY_VIEW_COOKIE,
  LIBRARY_VIEW_MAX_AGE,
  type LibraryView,
} from "./library-view";

// Container for the two library views. Client-side because the switch is a
// piece of local UI state — the rows are identical either way, so re-rendering
// them on the server to change their arrangement would be a round trip that
// buys nothing.

function EmptyState() {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      <p className="font-medium">No cookbooks yet.</p>
      <p className="mt-1 text-subheadline text-foreground-secondary">
        Create one to start collecting recipes.
      </p>
    </div>
  );
}

function ViewButton({
  view,
  current,
  onSelect,
  children,
}: {
  view: LibraryView;
  current: LibraryView;
  onSelect: (view: LibraryView) => void;
  children: React.ReactNode;
}) {
  const selected = view === current;

  return (
    <button
      type="button"
      // aria-pressed rather than a radio group: these are two toggle buttons
      // that act immediately, not a choice to be submitted.
      aria-pressed={selected}
      onClick={() => onSelect(view)}
      className={`rounded-sm px-3 py-1 text-subheadline font-medium transition-colors ${
        selected
          ? "bg-background text-foreground shadow-xs"
          : "text-foreground-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function CookbookLibrary({
  cookbooks,
  initialView,
}: {
  cookbooks: CookbookSummary[];
  initialView: LibraryView;
}) {
  const [view, setView] = useState<LibraryView>(initialView);

  // Nothing to arrange, and no view worth choosing between.
  if (cookbooks.length === 0) return <EmptyState />;

  function selectView(next: LibraryView) {
    setView(next);
    // Written here, not read here: the server reads this on the next request so
    // the first paint is already correct. `lax` keeps it off cross-site
    // requests; it holds nothing sensitive either way.
    document.cookie = `${LIBRARY_VIEW_COOKIE}=${next}; path=/; max-age=${LIBRARY_VIEW_MAX_AGE}; samesite=lax`;
  }

  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-title-3">
          {cookbooks.length} {cookbooks.length === 1 ? "cookbook" : "cookbooks"}
        </h2>

        <div
          role="group"
          aria-label="Library layout"
          className="inline-flex gap-1 rounded-md bg-background-control p-1"
        >
          <ViewButton view="books" current={view} onSelect={selectView}>
            Books
          </ViewButton>
          <ViewButton view="list" current={view} onSelect={selectView}>
            List
          </ViewButton>
        </div>
      </div>

      {view === "books" ? (
        <CookbookShelf cookbooks={cookbooks} />
      ) : (
        <CookbookList cookbooks={cookbooks} />
      )}
    </>
  );
}
