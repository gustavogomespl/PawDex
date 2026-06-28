import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";
import { JoinPlaceForm } from "@/components/JoinPlaceForm";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const { code } = await params;
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;
  const response = await fetch(
    `${mlApiUrl}/invites/${encodeURIComponent(code)}`,
    { cache: "no-store", headers: internalApiHeaders() },
  );

  if (!response.ok) {
    return (
      <main className="app-shell">
        <h1>Convite invalido</h1>
        <p>Verifique o link com quem te convidou.</p>
      </main>
    );
  }

  const place = (await response.json()) as { placeId: string; name: string };

  return (
    <main className="app-shell">
      <h1>Entrar em {place.name}</h1>
      <JoinPlaceForm placeId={place.placeId} code={code} />
    </main>
  );
}
