"use client";

import { useState } from "react";

export type Report = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  note: string | null;
  reporterName: string | null;
  createdAt: string;
};

const REASON_LABEL: Record<string, string> = {
  duplicate: "Animal duplicado",
  wrong_info: "Informacao errada",
  inappropriate: "Conteudo improprio",
  at_risk: "Animal em risco",
  privacy: "Privacidade (rosto/placa visivel)",
};

export function ReportsQueue({
  placeId,
  reports: initial,
}: {
  placeId: string;
  reports: Report[];
}) {
  const [reports, setReports] = useState<Report[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, status: "resolved" | "dismissed") {
    setBusyId(id);
    try {
      const response = await fetch(`/api/places/${placeId}/reports/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        setReports((current) => current.filter((report) => report.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="reports-queue" aria-label="Denuncias">
      <h2>Denuncias abertas ({reports.length})</h2>
      {reports.length === 0 ? (
        <p>Nenhuma denuncia aberta. Tudo certo por aqui.</p>
      ) : (
        <ul className="reports-list">
          {reports.map((report) => (
            <li key={report.id}>
              <div className="reports-list__copy">
                <strong>{REASON_LABEL[report.reason] ?? report.reason}</strong>
                <span>
                  {report.targetType} · {report.targetId}
                  {report.reporterName ? ` · por ${report.reporterName}` : ""}
                </span>
                {report.note ? <em>“{report.note}”</em> : null}
              </div>
              <div className="member-actions">
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => act(report.id, "resolved")}
                >
                  Resolver
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => act(report.id, "dismissed")}
                >
                  Descartar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
