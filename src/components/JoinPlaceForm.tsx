"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type JoinPlaceFormProps = {
  placeId: string;
  code: string;
};

export function JoinPlaceForm({ placeId, code }: JoinPlaceFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function join(body: Record<string, unknown>) {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/places/${placeId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { status?: string; error?: string };
      if (!response.ok) {
        setError(data.error ?? "Nao foi possivel entrar.");
        return;
      }
      if (data.status === "approved") {
        router.push(`/places/${placeId}`);
        return;
      }
      setStatus("Solicitacao enviada. Aguarde a aprovacao do admin.");
    } catch {
      setError("Nao foi possivel entrar agora.");
    } finally {
      setIsBusy(false);
    }
  }

  function joinByGps() {
    if (!navigator.geolocation) {
      setError("Geolocalizacao indisponivel neste navegador.");
      return;
    }
    setIsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void join({
          method: "gps",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setIsBusy(false);
        setError("Nao foi possivel obter sua localizacao.");
      },
    );
  }

  return (
    <div className="join-actions">
      <button
        className="primary-action"
        type="button"
        disabled={isBusy}
        onClick={() => join({ method: "invite", code })}
      >
        Entrar com o convite
      </button>
      <button
        className="secondary-action"
        type="button"
        disabled={isBusy}
        onClick={joinByGps}
      >
        Estou no local (GPS)
      </button>
      <button
        className="secondary-action"
        type="button"
        disabled={isBusy}
        onClick={() => join({ method: "request" })}
      >
        Solicitar entrada
      </button>
      {status ? (
        <p className="notice" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice--warning" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
