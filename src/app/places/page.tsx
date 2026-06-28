import Link from "next/link";
import { redirect } from "next/navigation";
import { Album, LockKeyhole, Plus, ShieldCheck, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { AlbumCodeForm } from "@/components/AlbumCodeForm";
import type { PlaceSummary } from "@/domain/places/server";
import { fetchPlacesForUser } from "@/domain/places/server";

const PRIVACY_LABEL: Record<string, string> = {
  public: "Publico",
  private: "Privado",
  "invite-only": "Somente convidados",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  member: "Membro",
};

export default async function PlacesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const places = await fetchPlacesForUser(session.user.id);

  return (
    <main className="app-shell">
      <header className="places-header places-header--album">
        <div>
          <span className="section-eyebrow">
            <Album aria-hidden="true" size={16} />
            PawDex por lugar
          </span>
          <h1>Meus albuns</h1>
          <p>
            Cada album mostra apenas os lugares onde sua conta ja foi aprovada.
          </p>
        </div>
        <nav className="places-actions" aria-label="Acoes dos albuns">
          <Link className="secondary-action" href="/account">
            <UserRound aria-hidden="true" size={18} />
            Minha conta
          </Link>
          <Link className="primary-action" href="/places/new">
            <Plus aria-hidden="true" size={18} />
            Criar album
          </Link>
        </nav>
      </header>

      <AlbumCodeForm />

      {places.length === 0 ? (
        <section className="empty-album-state">
          <Album aria-hidden="true" size={42} />
          <div>
            <h2>Nenhum album criado ainda.</h2>
            <p>
              Crie um lugar privado para comecar a colecao de avistamentos com
              acesso controlado.
            </p>
          </div>
          <Link className="primary-action" href="/places/new">
            <Plus aria-hidden="true" size={18} />
            Criar primeiro album
          </Link>
        </section>
      ) : (
        <ul className="places-album-grid">
          {places.map((place) => (
            <li className="place-album-cover" key={place.id}>
              <div className="place-album-cover__topline">
                <span>
                  <LockKeyhole aria-hidden="true" size={14} />
                  {PRIVACY_LABEL[place.privacyLevel] ?? place.privacyLevel}
                </span>
                <span>
                  <ShieldCheck aria-hidden="true" size={14} />
                  {ROLE_LABEL[place.role] ?? place.role}
                </span>
              </div>
              <div className="place-album-cover__art" aria-hidden="true">
                {placeInitials(place)}
              </div>
              <div className="place-album-cover__copy">
                <h2>{place.name}</h2>
                <p>{place.type}</p>
                <span>{place.albumTotalSlots} espacos no album</span>
              </div>
              <div className="place-album-cover__actions">
                <Link className="primary-action" href={`/places/${place.id}`}>
                  Abrir album
                </Link>
                {place.role === "admin" ? (
                  <Link
                    className="secondary-action"
                    href={`/places/${place.id}/admin`}
                  >
                    Painel admin
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function placeInitials(place: PlaceSummary): string {
  return place.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
