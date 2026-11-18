// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, createCookbookAction, unstable_rethrow } = vi.hoisted(() => ({
  push: vi.fn(),
  createCookbookAction: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), unstable_rethrow }));
vi.mock("./actions", () => ({ createCookbookAction }));
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

import NewCookbook from "./new-cookbook";
import { COVER_TEMPLATES, FEATURED_TEMPLATES, templateDesign } from "@/lib/cover-templates";
import { DRAFT_KEY, type CookbookDraft } from "@/lib/cookbook-draft";
import { coverFields } from "@/lib/cover-fields";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  createCookbookAction.mockResolvedValue({ id: "cb1" });
});

const nameField = () => screen.getByRole("textbox", { name: "Name" });
const tile = (name: string) => screen.getByRole("button", { name });
const storedDraft = () =>
  JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as CookbookDraft | null;

function store(draft: Partial<CookbookDraft>) {
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ title: "", templateId: null, custom: null, ...draft }),
  );
}

describe("NewCookbook — trying a name on", () => {
  // A short row to choose from, with the way into the editor first in it.
  it("offers a way to design one, then a few ready-made covers", () => {
    render(<NewCookbook />);

    const labels = within(screen.getByRole("list"))
      .getAllByRole("button")
      // The label under each book; the book itself also carries the name.
      .map((b) => b.lastElementChild?.textContent);
    expect(labels).toEqual(["Design your own", ...FEATURED_TEMPLATES.map((t) => t.name)]);
  });

  it("leaves the rest of the templates off the page", () => {
    render(<NewCookbook />);

    const unshown = COVER_TEMPLATES.filter((t) => !t.featured);
    expect(unshown.length).toBeGreaterThan(0);
    for (const template of unshown) {
      expect(screen.queryByRole("button", { name: template.name })).toBeNull();
    }
  });

  // The reason the name lives on this screen: type one, and it is on every
  // cover at once.
  it("prints the name as typed on every cover", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.type(nameField(), "Sunday Roasts");

    expect(screen.getAllByText("Sunday Roasts")).toHaveLength(FEATURED_TEMPLATES.length);
  });

  it("stands in a name on the covers until one is typed", () => {
    render(<NewCookbook />);
    expect(screen.getAllByText("Your cookbook")).toHaveLength(FEATURED_TEMPLATES.length);
  });
});

describe("NewCookbook — picking a cover", () => {
  it("starts with the first cover picked, so a name is all that's needed", () => {
    render(<NewCookbook />);
    expect(tile(FEATURED_TEMPLATES[0].name)).toHaveAttribute("aria-pressed", "true");
  });

  it("creates the cookbook with the name and the picked cover, then moves on to inviting", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);
    const picnic = COVER_TEMPLATES.find((t) => t.id === "picnic")!;

    await user.type(nameField(), "Sunday Roasts");
    await user.click(tile("Picnic"));
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    expect(createCookbookAction).toHaveBeenCalledWith({
      title: "Sunday Roasts",
      cover: coverFields(templateDesign(picnic)),
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cookbooks/cb1/setup/invite"));
  });

  it("creates on Enter in the name field", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.type(nameField(), "Soups{Enter}");

    expect(createCookbookAction).toHaveBeenCalledTimes(1);
  });

  // With an input method (Japanese, Chinese, Korean…), Enter confirms the
  // characters being composed. The name isn't finished, so nothing is made.
  it("doesn't create on the Enter that confirms composed text", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.type(nameField(), "ばんごはん");
    fireEvent.keyDown(nameField(), { key: "Enter", isComposing: true });

    expect(createCookbookAction).not.toHaveBeenCalled();
  });

  // Colour, pattern and the rest live in the editor. This page keeps the two
  // ways forward side by side instead: use the cover, or open it.
  it("puts creating and customising next to each other, and nothing else to set", () => {
    render(<NewCookbook />);

    expect(screen.getByRole("button", { name: "Create cookbook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Customise this cover" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Colour" })).toBeNull();
  });
});

describe("NewCookbook — when it can't be created", () => {
  it("asks for a name before asking the server", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Give your cookbook a name.");
    expect(nameField()).toHaveFocus();
    expect(createCookbookAction).not.toHaveBeenCalled();
  });

  it("clears the complaint once a name is being typed", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.click(screen.getByRole("button", { name: "Create cookbook" }));
    await user.type(nameField(), "S");

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows what the server said, and stays put with the work intact", async () => {
    const user = userEvent.setup();
    createCookbookAction.mockResolvedValue({ error: "That cover can't be saved." });
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That cover can't be saved.");
    expect(push).not.toHaveBeenCalled();
    expect(nameField()).toHaveValue("Soups");
    expect(storedDraft()?.title).toBe("Soups");
  });
});

describe("NewCookbook — when the call itself fails", () => {
  // Offline, or the server falling over: the action rejects rather than
  // answering. Uncaught, that replaces the page with the error screen.
  it("says so and keeps the work, rather than losing the page", async () => {
    const user = userEvent.setup();
    createCookbookAction.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't go through");
    expect(nameField()).toHaveValue("Soups");
    expect(storedDraft()?.title).toBe("Soups");
    expect(push).not.toHaveBeenCalled();
  });

  it("can be tried again once it has failed", async () => {
    const user = userEvent.setup();
    createCookbookAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/cookbooks/cb1/setup/invite"));
  });

  // The action's auth gate redirects by throwing. That is Next's to handle:
  // it must be handed back, not reported as a failure.
  it("hands a framework redirect back to Next instead of reporting it", async () => {
    const user = userEvent.setup();
    const redirect = new Error("NEXT_REDIRECT");
    createCookbookAction.mockRejectedValue(redirect);
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirect));
  });
});

describe("NewCookbook — the draft", () => {
  // Nothing exists until "Create cookbook", so what is in flight is kept in
  // the browser instead.
  it("keeps the name and the pick as they change", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await user.click(tile("Notebook"));

    await waitFor(() =>
      expect(storedDraft()).toMatchObject({ title: "Soups", templateId: "notebook" }),
    );
  });

  it("picks up where it was left", () => {
    store({ title: "Soups", templateId: "seal" });
    render(<NewCookbook />);

    expect(nameField()).toHaveValue("Soups");
    expect(tile("Seal")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Picked up where you left off/)).toBeInTheDocument();
  });

  it("can be thrown away to start over", async () => {
    const user = userEvent.setup();
    store({ title: "Soups", templateId: "seal" });
    render(<NewCookbook />);

    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(nameField()).toHaveValue("");
    expect(tile(FEATURED_TEMPLATES[0].name)).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/Picked up where you left off/)).toBeNull();
  });

  it("is gone once the cookbook exists", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await waitFor(() => expect(storedDraft()).not.toBeNull());
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(storedDraft()).toBeNull();
  });

  it("falls back to the first cover when the stored pick no longer exists", async () => {
    const user = userEvent.setup();
    store({ title: "Soups", templateId: "retired-template" });
    render(<NewCookbook />);

    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    expect(createCookbookAction).toHaveBeenCalledWith({
      title: "Soups",
      cover: coverFields(templateDesign(FEATURED_TEMPLATES[0])),
    });
  });
});

describe("NewCookbook — when the browser won't store anything", () => {
  // Private browsing, a full disk or blocked site data can make storage
  // throw. The draft is a convenience; the page has to work without it.
  it("starts empty when the draft can't be read", () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    render(<NewCookbook />);

    expect(nameField()).toHaveValue("");
    expect(tile(FEATURED_TEMPLATES[0].name)).toHaveAttribute("aria-pressed", "true");
    read.mockRestore();
  });

  it("still creates the cookbook when the draft can't be written", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await user.click(screen.getByRole("button", { name: "Create cookbook" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/cookbooks/cb1/setup/invite"));
    write.mockRestore();
  });
});

describe("NewCookbook — a draft from before the page was simplified", () => {
  // A stored pick can be a cover this page no longer shows.
  it("keeps their own design picked when the stored cover isn't offered", () => {
    store({ title: "Soups", templateId: "poster", custom: templateDesign(COVER_TEMPLATES[1]) });
    render(<NewCookbook />);

    expect(tile("Your design")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("NewCookbook — designing your own", () => {
  it("opens the editor on a blank cover carrying the name", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await user.click(tile("Design your own"));

    const editor = screen.getByRole("dialog", { name: "Cover editor" });
    expect(within(editor).getByRole("textbox", { name: "Cookbook name" })).toHaveValue("Soups");
  });

  it("keeps what was made as 'Your design', picked, with the new name", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.click(tile("Design your own"));
    const editor = screen.getByRole("dialog", { name: "Cover editor" });
    await user.type(within(editor).getByRole("textbox", { name: "Cookbook name" }), "Soups");
    await user.click(within(editor).getByRole("button", { name: "Oxblood" }));
    await user.click(within(editor).getByRole("button", { name: "Covers" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(nameField()).toHaveValue("Soups");
    expect(tile("Your design")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(storedDraft()?.custom?.coverColor).toBe(6));
  });

  // Opening the editor to look, and closing it, shouldn't swap a template for
  // an identical "design" of one's own.
  it("leaves the pick alone when the editor is closed untouched", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.click(tile("Picnic"));
    await user.click(screen.getByRole("button", { name: "Customise this cover" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Cover editor" })).getByRole("button", { name: "Covers" }),
    );

    expect(tile("Picnic")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Your design" })).toBeNull();
  });

  it("creates straight from the editor", async () => {
    const user = userEvent.setup();
    render(<NewCookbook />);

    await user.type(nameField(), "Soups");
    await user.click(screen.getByRole("button", { name: "Customise this cover" }));
    const editor = screen.getByRole("dialog", { name: "Cover editor" });
    await user.click(within(editor).getByRole("button", { name: "Linen" }));
    await user.click(within(editor).getByRole("button", { name: "Create cookbook" }));

    expect(createCookbookAction.mock.calls[0][0]).toMatchObject({
      title: "Soups",
      cover: { coverColor: "8" },
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cookbooks/cb1/setup/invite"));
  });
});
