import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreatePlaceForm } from "@/components/CreatePlaceForm";

export default async function NewPlacePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  return (
    <main className="app-shell">
      <h1>Criar lugar</h1>
      <p>Voce sera o admin deste lugar.</p>
      <CreatePlaceForm />
    </main>
  );
}
