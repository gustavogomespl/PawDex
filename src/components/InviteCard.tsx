"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function InviteCard({ inviteCode }: { inviteCode: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = `${origin}/join/${inviteCode}`;

  return (
    <section className="invite-card" aria-label="Convite">
      <h2>Convidar</h2>
      <p>Compartilhe este link ou QR para alguem entrar no lugar:</p>
      <code className="invite-link">{link}</code>
      {origin ? <QRCodeSVG value={link} size={160} /> : null}
      <button
        className="secondary-action"
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? "Copiado!" : "Copiar link"}
      </button>
    </section>
  );
}
