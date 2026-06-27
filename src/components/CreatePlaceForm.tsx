"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrivacyLevel } from "@/domain/pawdex/types";

export function CreatePlaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("office");
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>("invite-only");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, type, privacyLevel }),
      });

      if (!response.ok) {
        setError("Nao foi possivel criar o lugar agora.");
        setIsSubmitting(false);
        return;
      }

      const place = (await response.json()) as { id: string };
      router.push(`/places/${place.id}`);
    } catch {
      setError("Nao foi possivel criar o lugar agora.");
      setIsSubmitting(false);
    }
  }

  return (
    <form className="create-place-form" onSubmit={handleSubmit}>
      <label>
        Nome
        <input
          value={name}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Tipo
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="office">Escritorio</option>
          <option value="condo">Condominio</option>
          <option value="campus">Campus</option>
          <option value="cafe">Cafeteria</option>
          <option value="park">Parque</option>
          <option value="shelter">Abrigo/ONG</option>
          <option value="other">Outro</option>
        </select>
      </label>
      <label>
        Privacidade
        <select
          value={privacyLevel}
          onChange={(event) => setPrivacyLevel(event.target.value as PrivacyLevel)}
        >
          <option value="private">Privado</option>
          <option value="invite-only">Somente convidados</option>
          <option value="public">Publico</option>
        </select>
      </label>
      {error ? (
        <p className="notice notice--warning" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-action" type="submit" disabled={isSubmitting}>
        Criar
      </button>
    </form>
  );
}
