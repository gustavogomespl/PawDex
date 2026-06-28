"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TicketCheck } from "lucide-react";

export function AlbumCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function openInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      return;
    }
    router.push(`/join/${encodeURIComponent(trimmedCode)}`);
  }

  return (
    <form className="album-code-form" onSubmit={openInvite}>
      <div>
        <span className="section-eyebrow">
          <TicketCheck aria-hidden="true" size={16} />
          Entrar em album
        </span>
        <p>Recebeu um codigo do lugar? Use aqui para liberar o album.</p>
      </div>
      <label>
        <span>Codigo do album</span>
        <input
          name="albumCode"
          value={code}
          autoComplete="off"
          placeholder="ABC123"
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      <button className="primary-action" type="submit">
        Abrir convite
      </button>
    </form>
  );
}
