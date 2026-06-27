"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    await signIn("dev-email", { email, redirectTo: "/" });
  }

  return (
    <form className="signin-form" onSubmit={handleSubmit}>
      <label>
        E-mail
        <input
          type="email"
          name="email"
          value={email}
          required
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button className="primary-action" type="submit" disabled={isSubmitting}>
        Entrar
      </button>
    </form>
  );
}
