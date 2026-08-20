// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CookbookForm from "./cookbook-form";
import type { CreateCookbookState } from "./actions";

afterEach(cleanup);

describe("CookbookForm", () => {
  it("renders a labelled, required title field", () => {
    render(<CookbookForm action={vi.fn()} />);

    const title = screen.getByLabelText("Title");
    expect(title).toBeRequired();
    expect(title).not.toHaveAttribute("aria-invalid");
  });

  it("renders an optional description tied to its hint", () => {
    render(<CookbookForm action={vi.fn()} />);

    const description = screen.getByLabelText(/description/i);
    expect(description).not.toBeRequired();
    expect(description).toHaveAttribute("aria-describedby", "description-hint");
    expect(screen.getByText(/500 characters or fewer/)).toHaveAttribute(
      "id",
      "description-hint",
    );
  });

  it("offers a way out without submitting", () => {
    render(<CookbookForm action={vi.fn()} />);

    expect(screen.getByRole("link", { name: /cancel/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("submits the typed values to the action", async () => {
    // Type the mock's signature so `mock.calls` is the action's
    // (state, formData) tuple rather than an empty one.
    const action = vi.fn<
      (state: CreateCookbookState, formData: FormData) => Promise<CreateCookbookState>
    >(async () => ({}));
    render(<CookbookForm action={action} />);

    await userEvent.type(screen.getByLabelText("Title"), "Weeknight Dinners");
    await userEvent.click(
      screen.getByRole("button", { name: /create cookbook/i }),
    );

    expect(action).toHaveBeenCalled();
    expect(action.mock.calls[0][1].get("title")).toBe("Weeknight Dinners");
  });

  it("surfaces a server error in an alert and marks the title invalid", async () => {
    const action = vi.fn(async () => ({
      error: "Give your cookbook a title.",
      values: { title: "", description: "", coverImageUrl: "" },
    }));
    render(<CookbookForm action={action} />);

    await userEvent.click(
      screen.getByRole("button", { name: /create cookbook/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Give your cookbook a title.");
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "aria-describedby",
      "title-error",
    );
  });

  it("repopulates the form from the values echoed back by the server", async () => {
    const action = vi.fn(async () => ({
      error: "Title must be 80 characters or fewer.",
      values: { title: "a long title", description: "Fast meals.", coverImageUrl: "" },
    }));
    render(<CookbookForm action={action} />);

    await userEvent.click(
      screen.getByRole("button", { name: /create cookbook/i }),
    );
    await screen.findByRole("alert");

    expect(screen.getByLabelText("Title")).toHaveValue("a long title");
    expect(screen.getByLabelText(/description/i)).toHaveValue("Fast meals.");
  });
});
