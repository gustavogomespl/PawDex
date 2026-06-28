"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { LockKeyhole, Mail, UserRound } from "lucide-react";

type AuthMode = "signin" | "signup";

const AUTH_ERROR_MESSAGE =
  "Nao foi possivel entrar. Confira os dados e tente novamente.";

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    try {
      const result = await signIn("dev-email", {
        email,
        password,
        mode,
        ...(mode === "signup" ? { name } : {}),
        redirect: false,
        redirectTo: "/",
      });

      if (result?.ok) {
        router.push(result.url ?? "/");
        router.refresh();
        return;
      }

      setFormError(AUTH_ERROR_MESSAGE);
    } catch {
      setFormError(AUTH_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setFormError(null);
  }

  return (
    <form className="signin-form" onSubmit={handleSubmit}>
      <div className="signin-mode-switch" aria-label="Tipo de acesso">
        <button
          type="button"
          className={mode === "signin" ? "is-active" : ""}
          aria-pressed={mode === "signin"}
          onClick={() => selectMode("signin")}
        >
          Ja tenho cadastro
        </button>
        <button
          type="button"
          className={mode === "signup" ? "is-active" : ""}
          aria-pressed={mode === "signup"}
          onClick={() => selectMode("signup")}
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
      <label>
        <span>Senha</span>
        <span className="field-shell">
          <LockKeyhole aria-hidden="true" size={18} />
          <input
            type="password"
            name="password"
            value={password}
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="minimo 8 caracteres"
            onChange={(event) => setPassword(event.target.value)}
          />
        </span>
      </label>
      <p className="signin-form__hint">
        {mode === "signup"
          ? "Depois de criar sua conta, use o codigo do album na area logada."
          : "Depois de entrar, voce pode abrir novos albuns pelo codigo do lugar."}
      </p>
      {formError ? (
        <p className="signin-form__error" role="alert">
          {formError}
        </p>
      ) : null}
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
