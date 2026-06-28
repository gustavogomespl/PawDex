"use client";

import { useState } from "react";

type Suggestion = { name: string; votes: number };

export function NameVoting({
  placeId,
  animalId,
}: {
  placeId: string;
  animalId: string;
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [canPromote, setCanPromote] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch(
        `/api/places/${placeId}/animals/${animalId}/names`,
      );
      if (response.ok) {
        const data = (await response.json()) as {
          suggestions?: Suggestion[];
          canPromote?: boolean;
        };
        setSuggestions(data.suggestions ?? []);
        setCanPromote(Boolean(data.canPromote));
      }
    } catch {
      /* leave list empty */
    }
  }

  async function openPanel() {
    setOpen(true);
    await load();
  }

  async function vote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/places/${placeId}/animals/${animalId}/names`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function promote(picked: string) {
    setBusy(true);
    try {
      await fetch(
        `/api/places/${placeId}/animals/${animalId}/names/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: picked }),
        },
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="secondary-action" type="button" onClick={openPanel}>
        Votar no nome
      </button>
    );
  }

  const leader = suggestions[0];

  return (
    <section className="name-voting" aria-label="Votacao de nome">
      <h3>Nome da comunidade</h3>
      {leader ? (
        <p className="name-voting__leader">
          Lider: <strong>{leader.name}</strong> ({leader.votes})
        </p>
      ) : (
        <p>Ainda sem sugestoes — proponha o primeiro nome.</p>
      )}

      <form className="name-voting__form" onSubmit={vote}>
        <input
          value={name}
          maxLength={40}
          placeholder="Sugerir / votar um nome"
          onChange={(event) => setName(event.target.value)}
        />
        <button className="primary-action" type="submit" disabled={busy}>
          Votar
        </button>
      </form>

      <ul className="name-voting__list">
        {suggestions.map((suggestion) => (
          <li key={suggestion.name}>
            <span>{suggestion.name}</span>
            <span className="name-voting__count">
              {suggestion.votes} {suggestion.votes === 1 ? "voto" : "votos"}
            </span>
            {canPromote ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => promote(suggestion.name)}
              >
                Tornar oficial
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
