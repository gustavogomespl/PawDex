import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RemoveContentButton } from "@/components/RemoveContentButton";
import { SignOutButton } from "@/components/SignOutButton";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  return (
    <main className="app-shell">
      <header className="account-header">
        <div>
          <h1>Minha conta</h1>
          <p>{session.user.email}</p>
        </div>
        <SignOutButton />
      </header>
      <p>
        <Link href="/places">Meus lugares</Link> ·{" "}
        <Link href="/terms">Termos e Privacidade</Link>
      </p>

      <h2>Seus dados (LGPD)</h2>
      <p>
        Voce pode remover, a qualquer momento, todo o conteudo que criou (animais
        e avistamentos). Esta acao e permanente.
      </p>
      <RemoveContentButton />
    </main>
  );
}
