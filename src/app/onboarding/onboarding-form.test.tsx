// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingForm from "./onboarding-form";

afterEach(cleanup);

describe("OnboardingForm", () => {
  it("renders a labelled, required username tied to its hint", () => {
    render(<OnboardingForm action={vi.fn()} />);

    const username = screen.getByLabelText("Username");
    expect(username).toBeRequired();
    expect(username).toHaveAttribute("aria-describedby", "username-hint");
    expect(screen.getByText(/3–20 characters/)).toHaveAttribute(
      "id",
      "username-hint",
    );
  });

  it("groups the optional name fields in a labelled fieldset", () => {
    render(<OnboardingForm action={vi.fn()} />);

    expect(
      screen.getByRole("group", { name: /your name/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
  });

  it("prefills name defaults from props", () => {
    render(
      <OnboardingForm
        action={vi.fn()}
        defaultFirstName="Ryan"
        defaultLastName="K"
      />,
    );

    expect(screen.getByLabelText("First name")).toHaveValue("Ryan");
    expect(screen.getByLabelText("Last name")).toHaveValue("K");
  });

  it("surfaces a server error in an alert and marks the field invalid", async () => {
    const action = vi.fn(async () => ({
      error: "That username is already taken.",
      values: { username: "taken", firstName: "", lastName: "" },
    }));
    render(<OnboardingForm action={action} />);

    await userEvent.type(screen.getByLabelText("Username"), "taken");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That username is already taken.");
    expect(action).toHaveBeenCalled();
    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
