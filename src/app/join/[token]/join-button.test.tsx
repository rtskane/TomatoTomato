// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JoinButton from "./join-button";
import type { JoinState } from "./actions";

afterEach(cleanup);

describe("JoinButton", () => {
  it("joins when pressed, and shows it's working meanwhile", async () => {
    let finish: (state: JoinState) => void = () => {};
    const action = vi.fn(() => new Promise<JoinState>((resolve) => (finish = resolve)));
    render(<JoinButton action={action} label="Join Weeknight Dinners" />);

    await userEvent.click(screen.getByRole("button", { name: "Join Weeknight Dinners" }));

    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Joining…" })).toBeDisabled();
    finish({});
  });

  it("says why when joining didn't work", async () => {
    const action = vi.fn(async () => ({ error: "This link doesn't work any more." }));
    render(<JoinButton action={action} label="Join" />);

    await userEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't work any more");
  });
});
