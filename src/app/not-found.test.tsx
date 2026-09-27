// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import NotFound from "./not-found";

afterEach(cleanup);

describe("NotFound", () => {
  it("says the page isn't here and links back into the app", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: /couldn.t find that page/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Tomato Tomato" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
