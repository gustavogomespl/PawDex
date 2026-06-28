"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Member = {
  userId: string;
  role: string;
  status: string;
  email: string;
  name: string | null;
};

export function MembersManager({
  placeId,
  members,
}: {
  placeId: string;
  members: Member[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(userId: string, status: "approved" | "rejected") {
    setBusyId(userId);
    try {
      await fetch(`/api/places/${placeId}/members/${userId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Membros">
      <h2>Membros</h2>
      <ul className="members-list">
        {members.map((member) => (
          <li key={member.userId}>
            <span>
              {member.name ?? member.email} · {member.role} · {member.status}
            </span>
            {member.status === "pending" ? (
              <span className="member-actions">
                <button
                  type="button"
                  disabled={busyId === member.userId}
                  onClick={() => setStatus(member.userId, "approved")}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  disabled={busyId === member.userId}
                  onClick={() => setStatus(member.userId, "rejected")}
                >
                  Rejeitar
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
