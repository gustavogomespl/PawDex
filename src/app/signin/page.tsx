import { SignInForm } from "@/components/SignInForm";

export default function SignInPage() {
  return (
    <main className="app-shell">
      <h1>Entrar na PawDex</h1>
      <p>Use seu e-mail para entrar. (Login de desenvolvimento — sem senha.)</p>
      <SignInForm />
    </main>
  );
}
