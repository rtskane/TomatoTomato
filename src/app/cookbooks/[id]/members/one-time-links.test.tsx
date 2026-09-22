// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach, type Mock } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OneTimeLinks from "./one-time-links";
import type { MemberActionState, OneTimeLinkState } from "./actions";
import type { OneTimeLinkView } from "@/server/services/member.service";

afterEach(cleanup);

type CreateAction = (s: OneTimeLinkState, fd: FormData) => Promise<OneTimeLinkState>;
type RevokeAction = (s: MemberActionState, fd: FormData) => Promise<MemberActionState>;

const mum: OneTimeLinkView = { id: "inv9", token: "once", role: "EDITOR", label: "Mum", daysLeft: 6 };
const unlabelled: OneTimeLinkView = { id: "inv8", token: "twice", role: "VIEWER", label: null, daysLeft: 1 };

function renderLinks(
  links: OneTimeLinkView[] = [],
  {
    createAction = vi.fn<CreateAction>(async () => ({ created: mum })),
    revokeAction = vi.fn<RevokeAction>(async () => ({})),
  }: { createAction?: Mock<CreateAction>; revokeAction?: Mock<RevokeAction> } = {},
) {
  const result = render(
    <OneTimeLinks links={links} createAction={createAction} revokeAction={revokeAction} />,
  );
  return { ...result, createAction, revokeAction };
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
});

describe("OneTimeLinks — making one", () => {
  it("says what a one-time link is, and how long it lasts", () => {
    renderLinks();
    expect(screen.getByText(/one person in, once.*after 7 days/i)).toBeInTheDocument();
  });

  it("creates a link with the label and role chosen, as a Viewer by default", async () => {
    const { createAction } = renderLinks();

    await userEvent.type(screen.getByLabelText("Who the link is for"), "Mum");
    await userEvent.click(screen.getByRole("button", { name: "Create link" }));

    await waitFor(() => expect(createAction).toHaveBeenCalled());
    const formData = createAction.mock.calls[0][1];
    expect(formData.get("label")).toBe("Mum");
    expect(formData.get("role")).toBe("VIEWER");
  });

  it("sends the role picked", async () => {
    const { createAction } = renderLinks();

    await userEvent.selectOptions(screen.getByLabelText("Role for the new link"), "EDITOR");
    await userEvent.click(screen.getByRole("button", { name: "Create link" }));

    await waitFor(() => expect(createAction.mock.calls[0][1].get("role")).toBe("EDITOR"));
  });

  it("marks the link just made as new", async () => {
    const { rerender, createAction, revokeAction } = renderLinks();

    await userEvent.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(createAction).toHaveBeenCalled());
    // The page re-renders with the revalidated list, now including it.
    rerender(<OneTimeLinks links={[mum, unlabelled]} createAction={createAction} revokeAction={revokeAction} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("New");
    expect(rows[1]).not.toHaveTextContent("New");
  });

  it("says why a link wasn't made", async () => {
    renderLinks([], { createAction: vi.fn<CreateAction>(async () => ({ error: "Keep the label under 40 characters." })) });

    await userEvent.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("under 40 characters");
  });
});

describe("OneTimeLinks — the unused ones", () => {
  it("names each by its label, its role and how long it has left", () => {
    renderLinks([mum, unlabelled]);

    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("Mum");
    expect(first).toHaveTextContent("Editor · expires in 6 days");
    expect(second).toHaveTextContent("One-time link");
    expect(second).toHaveTextContent("Viewer · expires within a day");
  });

  it("lists nothing when there are none", () => {
    renderLinks();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("copies a link again", async () => {
    renderLinks([mum]);

    await userEvent.click(screen.getByRole("button", { name: "Copy link for Mum" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/join/once`);
    expect(screen.getByRole("button", { name: "Copy link for Mum" })).toHaveTextContent("Copied");
  });

  // No clipboard permission: the button gives way to the link, selected, to
  // copy by hand — in the same spot, so the row keeps its shape.
  it("shows the link to copy by hand when the clipboard refuses", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => { throw new Error("denied"); }) },
      configurable: true,
    });
    renderLinks([mum]);

    await userEvent.click(screen.getByRole("button", { name: "Copy link for Mum" }));

    const field = await screen.findByRole("textbox", { name: "link for Mum" });
    expect(field).toHaveValue(`${window.location.origin}/join/once`);
    expect(field).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Copy link for Mum" })).toBeNull();
  });

  it("revokes a link by its invite id", async () => {
    const { revokeAction } = renderLinks([mum]);

    await userEvent.click(screen.getByRole("button", { name: "Revoke link for Mum" }));

    await waitFor(() => expect(revokeAction).toHaveBeenCalled());
    expect(revokeAction.mock.calls[0][1].get("linkId")).toBe("inv9");
  });

  it("says why a link couldn't be revoked", async () => {
    renderLinks([mum], { revokeAction: vi.fn<RevokeAction>(async () => ({ error: "Only the owner can." })) });

    await userEvent.click(screen.getByRole("button", { name: "Revoke link for Mum" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only the owner can.");
  });
});
