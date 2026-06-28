"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminAnimal = {
  id: string;
  displayName: string;
};

export function AnimalAdminList({
  placeId,
  animals,
}: {
  placeId: string;
  animals: AdminAnimal[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(animalId: string) {
    if (
      !window.confirm("Apagar este animal e todos os seus avistamentos?")
    ) {
      return;
    }
    setBusyId(animalId);
    try {
      await fetch(`/api/places/${placeId}/animals/${animalId}`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (animals.length === 0) {
    return null;
  }

  return (
    <section aria-label="Animais">
      <h2>Animais</h2>
      <ul className="admin-animals-list">
        {animals.map((animal) => (
          <li key={animal.id}>
            <span>{animal.displayName}</span>
            <button
              type="button"
              disabled={busyId === animal.id}
              onClick={() => remove(animal.id)}
            >
              Apagar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
