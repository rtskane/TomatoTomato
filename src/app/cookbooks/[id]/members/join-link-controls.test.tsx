// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach, type Mock } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JoinLinkControls from "./join-link-controls";
import type { JoinLinkState } from "./actions";

afterEach(cleanup);

type LinkAction = (state: JoinLinkState, formData: FormData) => Promise<JoinLinkState>;

const ON = { token: "tok123", role: "VIEWER" as const };
const OFF = { token: null, role: "VIEWER" as const };

function renderControls(
  link: { token: string | null; role: "VIEWER" | "EDITOR" },
  overrides: Partial<Record<"setEnabledAction" | "setRoleAction" | "resetAction", Mock<LinkAction>>> = {},
) {
  const actions = {
    setEnabledAction: vi.fn<LinkAction>(async (_s, fd) => ({
      link: { token: fd.get("enabled") === "true" ? "fresh" : null, role: link.role },
    })),
    setRoleAction: vi.fn<LinkAction>(async (_s, fd) => ({
      link: { token: link.token, role: fd.get("role") as "VIEWER" | "EDITOR" },
    })),
    resetAction: vi.fn<LinkAction>(async () => ({ link: { token: "renewed", role: link.role } })),
    ...overrides,
  };
  render(<JoinLinkControls link={link} {...actions} />);
  return actions;
}

const linkField = () => screen.getByRole("textbox", { name: "Invite link" });

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
});

describe("JoinLinkControls — off", () => {
  it("says only invited people can join, and shows no link", () => {
    renderControls(OFF);

    expect(screen.getByRole("switch", { name: "Invite link" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/only people you invite by name/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("turns on, and shows the new link from this site", async () => {
    const actions = renderControls(OFF);

    await userEvent.click(screen.getByRole("switch"));

    expect(actions.setEnabledAction.mock.calls[0][1].get("enabled")).toBe("true");
    await waitFor(() =>
      expect(linkField()).toHaveValue(`${window.location.origin}/join/fresh`),
    );
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});

describe("JoinLinkControls — on", () => {
  it("shows the link and the role it grants", () => {
    renderControls({ token: "tok123", role: "EDITOR" });

    expect(linkField()).toHaveValue(`${window.location.origin}/join/tok123`);
    expect(screen.getByRole("combobox", { name: /can join as/i })).toHaveValue("EDITOR");
  });

  it("turns off, and the link disappears", async () => {
    const actions = renderControls(ON);

    await userEvent.click(screen.getByRole("switch"));

    expect(actions.setEnabledAction.mock.calls[0][1].get("enabled")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  // The select isn't in a <form>, so React's reset-after-action can't snap it
  // back to the old role once the change has landed.
  it("changes the role, and keeps showing the new one", async () => {
    const actions = renderControls(ON);

    await userEvent.selectOptions(screen.getByRole("combobox"), "EDITOR");

    expect(actions.setRoleAction.mock.calls[0][1].get("role")).toBe("EDITOR");
    await waitFor(() => expect(actions.setRoleAction).toHaveBeenCalled());
    expect(screen.getByRole("combobox")).toHaveValue("EDITOR");
  });

  it("puts the role back, and says why, when a change is refused", async () => {
    renderControls(ON, {
      setRoleAction: vi.fn<LinkAction>(async () => ({ error: "Pick a valid role." })),
    });

    await userEvent.selectOptions(screen.getByRole("combobox"), "EDITOR");

    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a valid role.");
    expect(screen.getByRole("combobox")).toHaveValue("VIEWER");
  });

  it("copies the full link", async () => {
    renderControls(ON);

    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/join/tok123`,
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  });

  // No clipboard permission: the link is still there to copy by hand.
  it("focuses the link for copying by hand when the clipboard refuses", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => { throw new Error("denied"); }) },
      configurable: true,
    });
    renderControls(ON);

    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(linkField()).toHaveFocus();
  });

  // Resetting kills a link that may be in many hands, so it asks first.
  it("asks before resetting, and can be talked out of it", async () => {
    const actions = renderControls(ON);

    await userEvent.click(screen.getByRole("button", { name: "Reset link" }));
    expect(screen.getByText(/current link will stop working/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(actions.resetAction).not.toHaveBeenCalled();
    expect(linkField()).toHaveValue(`${window.location.origin}/join/tok123`);
  });

  it("resets to a new link once confirmed", async () => {
    const actions = renderControls(ON);

    await userEvent.click(screen.getByRole("button", { name: "Reset link" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset link" }));

    expect(actions.resetAction).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(linkField()).toHaveValue(`${window.location.origin}/join/renewed`),
    );
  });

  // Two seconds of "Copied", then back to the button's usual label.
  it("goes back to \"Copy link\" after a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderControls(ON);
      await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // After an action lands the page re-renders with fresh data — including a
  // change made in another tab — and the controls follow it.
  it("follows the link the page is re-rendered with", () => {
    const { rerender } = render(
      <JoinLinkControls
        link={ON}
        setEnabledAction={vi.fn()}
        setRoleAction={vi.fn()}
        resetAction={vi.fn()}
      />,
    );

    rerender(
      <JoinLinkControls
        link={{ token: "elsewhere", role: "EDITOR" }}
        setEnabledAction={vi.fn()}
        setRoleAction={vi.fn()}
        resetAction={vi.fn()}
      />,
    );

    expect(linkField()).toHaveValue(`${window.location.origin}/join/elsewhere`);
    expect(screen.getByRole("combobox")).toHaveValue("EDITOR");
  });

  it("says why a switch didn't flip", async () => {
    renderControls(ON, {
      setEnabledAction: vi.fn<LinkAction>(async () => ({ error: "You can't change that." })),
    });

    await userEvent.click(screen.getByRole("switch"));

    expect(await screen.findByRole("alert")).toHaveTextContent("You can't change that.");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});
