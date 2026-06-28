import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";
import { fetchPlacesForUser } from "@/domain/places/server";
import { InviteCard } from "@/components/InviteCard";
import { MembersManager, type Member } from "@/components/MembersManager";
import { AnimalAdminList, type AdminAnimal } from "@/components/AnimalAdminList";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export default async function PlaceAdminPage({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const { placeId } = await params;
  const places = await fetchPlacesForUser(session.user.id);
  const place = places.find((candidate) => candidate.id === placeId);

  if (!place || place.role !== "admin") {
    redirect(`/places/${placeId}`);
  }

  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;
  const response = await fetch(
    `${mlApiUrl}/places/${encodeURIComponent(placeId)}/members?user_id=${encodeURIComponent(session.user.id)}`,
    { cache: "no-store", headers: internalApiHeaders() },
  );
  const members: Member[] = response.ok
    ? ((await response.json()).members as Member[])
    : [];

  const stateResponse = await fetch(
    `${mlApiUrl}/places/${encodeURIComponent(placeId)}/state?user_id=${encodeURIComponent(session.user.id)}`,
    { cache: "no-store", headers: internalApiHeaders() },
  );
  const animals: AdminAnimal[] = stateResponse.ok
    ? ((await stateResponse.json()).animals as AdminAnimal[])
    : [];

  return (
    <main className="app-shell">
      <header className="places-header">
        <h1>Admin · {place.name}</h1>
        <span>
          <Link href={`/places/${placeId}`}>Voltar ao album</Link>{" "}
          <a href={`/api/places/${placeId}/export`}>Exportar dados (JSON)</a>
        </span>
      </header>
      {place.inviteCode ? <InviteCard inviteCode={place.inviteCode} /> : null}
      <MembersManager placeId={placeId} members={members} />
      <AnimalAdminList placeId={placeId} animals={animals} />
    </main>
  );
}
