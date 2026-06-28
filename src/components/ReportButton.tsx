"use client";

import { useState } from "react";

const REASONS: ReadonlyArray<[string, string]> = [
  ["duplicate", "Animal duplicado"],
  ["wrong_info", "Informacao errada"],
  ["inappropriate", "Conteudo improprio"],
  ["at_risk", "Animal em risco"],
  ["privacy", "Privacidade (rosto/placa visivel)"],
];

export function ReportButton({
  placeId,
  targetType,
  targetId,
}: {
  placeId: string;
  targetType: "sighting" | "animal";
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("duplicate");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/places/${placeId}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          note: note.trim() || undefined,
        }),
      });
      if (response.ok) {
        setDone(true);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="report-done">Denuncia enviada para os admins. Obrigado!</p>;
  }

  if (!open) {
    return (
      <button
        className="report-trigger"
        type="button"
        onClick={() => setOpen(true)}
      >
        Reportar problema
      </button>
    );
  }

  return (
    <form className="report-form" onSubmit={submit} aria-label="Reportar problema">
      <select
        aria-label="Motivo"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      >
        {REASONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        value={note}
        maxLength={300}
        placeholder="Detalhe (opcional)"
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="report-form__actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
        <button className="primary-action" type="submit" disabled={busy}>
          Enviar denuncia
        </button>
      </div>
    </form>
  );
}
