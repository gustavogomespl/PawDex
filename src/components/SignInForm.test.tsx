import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { signIn } from "next-auth/react";
import { SignInForm } from "./SignInForm";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

describe("SignInForm", () => {
  it("submits e-mail and password to enter an existing account", async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockResolvedValue({
      error: undefined,
      code: undefined,
      status: 200,
      ok: true,
      url: "/",
    });

    render(<SignInForm />);

    await user.type(screen.getByLabelText("E-mail"), "tutor@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(signIn).toHaveBeenCalledWith("dev-email", {
      email: "tutor@example.com",
      password: "senha-segura",
      mode: "signin",
      redirectTo: "/",
    });
    expect(screen.queryByLabelText("Codigo de acesso")).not.toBeInTheDocument();
  });

  it("submits name, e-mail and password when creating an account", async () => {
    const user = userEvent.setup();
    vi.mocked(signIn).mockResolvedValue({
      error: undefined,
      code: undefined,
      status: 200,
      ok: true,
      url: "/",
    });

    render(<SignInForm />);

    await user.click(screen.getByRole("button", { name: "Cadastrar" }));
    await user.type(screen.getByLabelText("Nome"), "Ana Tutor");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(signIn).toHaveBeenCalledWith("dev-email", {
      email: "ana@example.com",
      name: "Ana Tutor",
      password: "senha-segura",
      mode: "signup",
      redirectTo: "/",
    });
  });
});
