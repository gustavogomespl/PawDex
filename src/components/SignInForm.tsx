"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Mail, UserRound } from "lucide-react";

type AuthMode = "signin" | "signup";

export function SignInForm() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    await signIn("dev-email", {
      email,
      ...(mode === "signup" ? { name } : {}),
      redirectTo: "/",
    });
  }

  return (
    <form className="signin-form" onSubmit={handleSubmit}>
      <div className="signin-mode-switch" aria-label="Tipo de acesso">
        <button
          type="button"
          className={mode === "signin" ? "is-active" : ""}
          aria-pressed={mode === "signin"}
          onClick={() => setMode("signin")}
        >
          Ja tenho cadastro
        </button>
        <button
          type="button"
          className={mode === "signup" ? "is-active" : ""}
          aria-pressed={mode === "signup"}
          onClick={() => setMode("signup")}
        >
          Cadastrar
        </button>
      </div>

      {mode === "signup" ? (
        <label>
          <span>Nome</span>
          <span className="field-shell">
            <UserRound aria-hidden="true" size={18} />
            <input
              type="text"
              name="name"
              value={name}
              required
              autoComplete="name"
              placeholder="Seu nome"
              onChange={(event) => setName(event.target.value)}
            />
          </span>
        </label>
      ) : null}

      <label>
        <span>E-mail</span>
        <span className="field-shell">
          <Mail aria-hidden="true" size={18} />
          <input
            type="email"
            name="email"
            value={email}
            required
            autoComplete="email"
            placeholder="voce@empresa.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </span>
      </label>
      <p className="signin-form__hint">
        {mode === "signup"
          ? "Depois de criar sua conta, use o codigo do album na area logada."
          : "Depois de entrar, voce pode abrir novos albuns pelo codigo do lugar."}
      </p>
      <button className="primary-action" type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? mode === "signup"
            ? "Criando..."
            : "Entrando..."
          : mode === "signup"
            ? "Criar conta"
            : "Entrar"}
      </button>
    </form>
  );
}
