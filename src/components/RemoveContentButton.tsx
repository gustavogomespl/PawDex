"use client";

import { useState } from "react";

export function RemoveContentButton() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        "Isto apaga definitivamente todos os animais e avistamentos que voce criou. Continuar?",
      )
    ) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/content", { method: "DELETE" });
      const data = (await response.json()) as {
        animalsDeleted?: number;
        sightingsDeleted?: number;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Nao foi possivel remover.");
        return;
      }
      setStatus(
        `Removidos: ${data.animalsDeleted ?? 0} animais e ${data.sightingsDeleted ?? 0} avistamentos.`,
      );
    } catch {
      setError("Nao foi possivel remover seu conteudo agora.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="danger-zone">
      <button
        className="secondary-action"
        type="button"
        disabled={isBusy}
        onClick={remove}
      >
        Remover meu conteudo
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
