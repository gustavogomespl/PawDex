import { internalApiHeaders } from "@/domain/auth/internal";

export type SyncedUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const email = raw.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export async function syncUser(
  email: string,
  name: string | null,
  fetchImpl: typeof fetch = fetch,
  mlApiUrl: string = process.env.ML_API_URL ?? DEFAULT_ML_API_URL,
): Promise<SyncedUser> {
  const response = await fetchImpl(`${mlApiUrl}/users/sync`, {
    method: "POST",
    headers: internalApiHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ email, name }),
  });

  if (!response.ok) {
    throw new Error("Falha ao sincronizar usuario com o servidor.");
  }

  return (await response.json()) as SyncedUser;
}
