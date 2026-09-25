// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorPage from "./error";

afterEach(cleanup);

describe("ErrorPage", () => {
  it("retries the page when asked", async () => {
    const retry = vi.fn();
    render(<ErrorPage error={new Error("boom")} unstable_retry={retry} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers a way back into the app", () => {
    render(<ErrorPage error={new Error("boom")} unstable_retry={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Back to Tomato Tomato" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows a server error's reference, to match it to the logs", () => {
    const error = Object.assign(new Error("hidden"), { digest: "3141592653" });
    render(<ErrorPage error={error} unstable_retry={vi.fn()} />);

    expect(screen.getByText("Reference: 3141592653")).toBeInTheDocument();
  });

  it("never shows the error's own message, which may be internal", () => {
    render(<ErrorPage error={new Error("prisma exploded")} unstable_retry={vi.fn()} />);

    expect(screen.queryByText(/prisma exploded/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reference/)).not.toBeInTheDocument();
  });
});
