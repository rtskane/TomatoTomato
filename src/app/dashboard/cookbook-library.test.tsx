// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CookbookLibrary from "./cookbook-library";
import { LIBRARY_VIEW_COOKIE, parseLibraryView } from "./library-view";
import type { CookbookSummary } from "@/server/services/cookbook.service";

afterEach(cleanup);

beforeEach(() => {
  document.cookie = `${LIBRARY_VIEW_COOKIE}=; path=/; max-age=0`;
});

function summary(overrides: Partial<CookbookSummary> = {}): CookbookSummary {
  return {
    id: "cb1",
    title: "Weeknight Dinners",
    description: "Fast meals.",
    role: "OWNER",
    recipeCount: 3,
    memberCount: 2,
    ...overrides,
  };
}

// The two views are told apart by something only one of them renders: the
// shelf prints each title twice (cover + label), the list shows descriptions.
const onShelf = () => screen.getAllByText("Weeknight Dinners").length === 2;
const inList = () => screen.queryByText("Fast meals.") !== null;

describe("CookbookLibrary — empty", () => {
  it("tells the user there are none and what to do", () => {
    render(<CookbookLibrary cookbooks={[]} initialView="books" />);

    expect(screen.getByText(/no cookbooks yet/i)).toBeInTheDocument();
    expect(screen.getByText(/create one/i)).toBeInTheDocument();
  });

  it("renders neither view, and no layout switch", () => {
    render(<CookbookLibrary cookbooks={[]} initialView="books" />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});

describe("CookbookLibrary — choosing a view", () => {
  it("opens on the view the server resolved", () => {
    render(<CookbookLibrary cookbooks={[summary()]} initialView="books" />);
    expect(onShelf()).toBe(true);

    cleanup();
    render(<CookbookLibrary cookbooks={[summary()]} initialView="list" />);
    expect(inList()).toBe(true);
    expect(onShelf()).toBe(false);
  });

  it("switches to the list and back", async () => {
    const user = userEvent.setup();
    render(<CookbookLibrary cookbooks={[summary()]} initialView="books" />);

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(inList()).toBe(true);

    await user.click(screen.getByRole("button", { name: "Books" }));
    expect(onShelf()).toBe(true);
  });

  it("marks the current view as pressed", async () => {
    const user = userEvent.setup();
    render(<CookbookLibrary cookbooks={[summary()]} initialView="books" />);

    expect(screen.getByRole("button", { name: "Books" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "List" }));

    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Books" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("counts the library", () => {
    render(
      <CookbookLibrary
        cookbooks={[summary(), summary({ id: "cb2" })]}
        initialView="books"
      />,
    );
    expect(screen.getByText("2 cookbooks")).toBeInTheDocument();

    cleanup();
    render(<CookbookLibrary cookbooks={[summary()]} initialView="books" />);
    expect(screen.getByText("1 cookbook")).toBeInTheDocument();
  });
});

describe("CookbookLibrary — remembering the choice", () => {
  // The cookie is what lets the *server* render the right view on the next
  // visit, so this is the whole point of writing it rather than keeping the
  // choice in component state.
  it("records the chosen view in a cookie the server can read", async () => {
    const user = userEvent.setup();
    render(<CookbookLibrary cookbooks={[summary()]} initialView="books" />);

    await user.click(screen.getByRole("button", { name: "List" }));

    expect(document.cookie).toContain(`${LIBRARY_VIEW_COOKIE}=list`);
    expect(parseLibraryView("list")).toBe("list");
  });

  it("overwrites the cookie when the choice changes back", async () => {
    const user = userEvent.setup();
    render(<CookbookLibrary cookbooks={[summary()]} initialView="books" />);

    await user.click(screen.getByRole("button", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Books" }));

    expect(document.cookie).toContain(`${LIBRARY_VIEW_COOKIE}=books`);
    expect(document.cookie).not.toContain(`${LIBRARY_VIEW_COOKIE}=list`);
  });
});

describe("parseLibraryView", () => {
  it("defaults to books when nothing has been chosen", () => {
    expect(parseLibraryView(undefined)).toBe("books");
  });

  it("defaults to books when the cookie holds junk", () => {
    // The value is client-writable, so it is never trusted as-is.
    expect(parseLibraryView("shelf")).toBe("books");
    expect(parseLibraryView("")).toBe("books");
  });

  it("honours a recognised value", () => {
    expect(parseLibraryView("list")).toBe("list");
    expect(parseLibraryView("books")).toBe("books");
  });
});
