import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

describe("Page", () => {
  it("renders the PawDex app shell", () => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: "PawDex" })).toBeInTheDocument();
  });
});
