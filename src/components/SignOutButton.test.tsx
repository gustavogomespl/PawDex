import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { signOut } from "next-auth/react";
import { SignOutButton } from "./SignOutButton";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

describe("SignOutButton", () => {
  it("signs out and returns to the sign-in page", async () => {
    const user = userEvent.setup();

    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/signin" });
  });
});
