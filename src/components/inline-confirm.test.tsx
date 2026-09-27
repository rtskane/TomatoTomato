// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InlineConfirm, { type InlineConfirmState } from "./inline-confirm";

afterEach(cleanup);

type Action = (
  state: InlineConfirmState,
  formData: FormData,
) => Promise<InlineConfirmState>;

function setup(action: Action = async () => ({})) {
  return render(
    <InlineConfirm
      action={action}
      triggerLabel="Leave this cookbook"
      title="Leave “Soups”?"
      confirmLabel="Leave"
      pendingLabel="Leaving…"
    >
      It leaves your library.
    </InlineConfirm>,
  );
}

const trigger = () => screen.getByRole("button", { name: "Leave this cookbook" });

describe("InlineConfirm", () => {
  it("asks before doing anything", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({}));
    setup(action);

    await user.click(trigger());

    expect(screen.getByText("Leave “Soups”?")).toBeInTheDocument();
    expect(screen.getByText("It leaves your library.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("runs the action on confirm, and shows a refusal", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({ error: "You can't." }));
    setup(action);

    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Leave" }));

    expect(action).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent("You can't.");
  });

  // The trigger unmounts on open, so without this focus fell out of the
  // surrounding dialog to <body>. Cancel, not the destructive button, so a
  // second Enter backs out.
  it("moves focus to Cancel when it opens", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(trigger());

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("hands focus back to the trigger on Cancel", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(trigger()).toHaveFocus();
  });

  // Only coming back from the box earns the trigger focus — on first render it
  // would steal it from whatever the surrounding dialog focused.
  it("doesn't take focus on first render", () => {
    setup();

    expect(trigger()).not.toHaveFocus();
  });
});
