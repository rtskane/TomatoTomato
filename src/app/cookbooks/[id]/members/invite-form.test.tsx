// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InviteForm from "./invite-form";
import type { InviteState } from "./actions";

afterEach(cleanup);

// Type the mock's signature so `mock.calls` is the action's (state, formData)
// tuple rather than an empty one.
const mockAction = (result: InviteState = {}) =>
  vi.fn<(state: InviteState, formData: FormData) => Promise<InviteState>>(
    async () => result,
  );

const rows = () => screen.getAllByRole("textbox");

describe("InviteForm", () => {
  it("starts with a single row", () => {
    render(<InviteForm action={mockAction()} />);

    expect(rows()).toHaveLength(1);
    expect(screen.getByLabelText("Username for person 1")).toBeInTheDocument();
  });

  it("adds and removes rows", async () => {
    const user = userEvent.setup();
    render(<InviteForm action={mockAction()} />);

    await user.click(screen.getByRole("button", { name: /add another/i }));
    expect(rows()).toHaveLength(2);

    await user.click(screen.getByLabelText("Remove person 2"));
    expect(rows()).toHaveLength(1);
  });

  // The last row can't be removed — an empty form has nothing to type into.
  it("won't remove the only row", () => {
    render(<InviteForm action={mockAction()} />);

    expect(screen.getByLabelText("Remove person 1")).toBeDisabled();
  });

  it("submits one username and role per row", async () => {
    const user = userEvent.setup();
    const action = mockAction();
    render(<InviteForm action={action} />);

    await user.type(screen.getByLabelText("Username for person 1"), "alice");
    await user.selectOptions(screen.getByLabelText("Role for person 1"), "EDITOR");
    await user.click(screen.getByRole("button", { name: /add another/i }));
    await user.type(screen.getByLabelText("Username for person 2"), "bob");
    await user.selectOptions(screen.getByLabelText("Role for person 2"), "VIEWER");

    await user.click(screen.getByRole("button", { name: /send invites/i }));

    const formData = action.mock.calls[0][1];
    expect(formData.getAll("inviteUsername")).toEqual(["alice", "bob"]);
    expect(formData.getAll("inviteRole")).toEqual(["EDITOR", "VIEWER"]);
  });

  // The common case is inviting several people at the same level, so per-row
  // control shouldn't cost anything when you don't need it.
  it("gives a new row the previous row's role", async () => {
    const user = userEvent.setup();
    render(<InviteForm action={mockAction()} />);

    await user.selectOptions(screen.getByLabelText("Role for person 1"), "EDITOR");
    await user.click(screen.getByRole("button", { name: /add another/i }));

    expect(screen.getByLabelText("Role for person 2")).toHaveValue("EDITOR");
  });

  it("still lets each row's role be set independently", async () => {
    const user = userEvent.setup();
    render(<InviteForm action={mockAction()} />);

    await user.selectOptions(screen.getByLabelText("Role for person 1"), "EDITOR");
    await user.click(screen.getByRole("button", { name: /add another/i }));
    await user.selectOptions(screen.getByLabelText("Role for person 2"), "VIEWER");

    expect(screen.getByLabelText("Role for person 1")).toHaveValue("EDITOR");
    expect(screen.getByLabelText("Role for person 2")).toHaveValue("VIEWER");
  });

  it("defaults to the least privileged role", () => {
    render(<InviteForm action={mockAction()} />);

    expect(screen.getByLabelText("Role for person 1")).toHaveValue("VIEWER");
  });

  // Enter is the reflex for "next person", not "send" — a half-filled list
  // shouldn't submit itself.
  it("adds a row on Enter instead of submitting", async () => {
    const user = userEvent.setup();
    const action = mockAction();
    render(<InviteForm action={action} />);

    await user.type(
      screen.getByLabelText("Username for person 1"),
      "alice{Enter}",
    );

    expect(rows()).toHaveLength(2);
    expect(action).not.toHaveBeenCalled();
  });

  it("reports each person's result separately", async () => {
    const user = userEvent.setup();
    const action = mockAction({
      outcomes: [
        { username: "alice", status: "invited", role: "EDITOR" },
        { username: "ghost", status: "not-found" },
      ],
    });
    render(<InviteForm action={action} />);

    await user.type(screen.getByLabelText("Username for person 1"), "alice");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    // `findBy*`, not `getBy*`: the action resolves asynchronously, so the
    // results list appears a tick after the click. A synchronous read here was
    // flaky — it passed most runs and failed about one in ten.
    const results = await screen.findByRole("status");
    expect(within(results).getByText("alice")).toBeInTheDocument();
    expect(within(results).getByText(/invited as editor/i)).toBeInTheDocument();
    expect(within(results).getByText(/no one goes by/i)).toBeInTheDocument();
  });

  // A typo on one row shouldn't cost the user the other names they just typed.
  it("keeps rows that failed and clears the ones that went through", async () => {
    const user = userEvent.setup();
    const action = mockAction({
      outcomes: [
        { username: "alice", status: "invited", role: "VIEWER" },
        { username: "ghost", status: "not-found" },
      ],
    });
    render(<InviteForm action={action} />);

    await user.type(screen.getByLabelText("Username for person 1"), "alice");
    await user.click(screen.getByRole("button", { name: /add another/i }));
    await user.type(screen.getByLabelText("Username for person 2"), "ghost");
    await user.click(screen.getByRole("button", { name: /send invites/i }));

    await screen.findByRole("status");
    const remaining = rows();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveValue("ghost");
  });

  it("resets to one blank row when everyone was invited", async () => {
    const user = userEvent.setup();
    const action = mockAction({
      outcomes: [{ username: "alice", status: "invited", role: "VIEWER" }],
    });
    render(<InviteForm action={action} />);

    await user.type(screen.getByLabelText("Username for person 1"), "alice");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await screen.findByRole("status");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveValue("");
  });

  it("surfaces a whole-request error as an alert", async () => {
    const user = userEvent.setup();
    const action = mockAction({ error: "You don't have permission." });
    render(<InviteForm action={action} />);

    await user.type(screen.getByLabelText("Username for person 1"), "alice");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have permission.",
    );
  });

  // The consent model is the whole point — say so where people are invited.
  it("tells the inviter that nobody joins until they accept", () => {
    render(<InviteForm action={mockAction()} />);

    expect(screen.getByText(/nobody joins until they accept/i)).toBeInTheDocument();
  });
});
