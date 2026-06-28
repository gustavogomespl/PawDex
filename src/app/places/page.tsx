import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchPlacesForUser } from "@/domain/places/server";

export default async function PlacesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const places = await fetchPlacesForUser(session.user.id);

  return (
    <main className="app-shell">
      <header className="places-header">
        <h1>Meus lugares</h1>
        <Link className="primary-action" href="/places/new">
          Criar lugar
        </Link>
      </header>

      {places.length === 0 ? (
        <p>
          Voce ainda nao participa de nenhum lugar. Crie um para comecar sua
          PawDex.
        </p>
      ) : (
        <ul className="places-list">
          {places.map((place) => (
            <li key={place.id}>
              <Link href={`/places/${place.id}`}>{place.name}</Link>
              <span>
                {place.type} · {place.privacyLevel} · {place.role}
              </span>
              {place.role === "admin" ? (
                <Link href={`/places/${place.id}/admin`}>Admin</Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
