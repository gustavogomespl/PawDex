import { internalApiHeaders } from "@/domain/auth/internal";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export type PlaceSummary = {
  id: string;
  name: string;
  type: string;
  privacyLevel: string;
  albumTotalSlots: number;
  photoUrl: string | null;
  inviteCode: string | null;
  role: string;
};

export async function fetchPlacesForUser(
  userId: string,
): Promise<PlaceSummary[]> {
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(
      `${mlApiUrl}/users/${encodeURIComponent(userId)}/places`,
      { cache: "no-store", headers: internalApiHeaders() },
    );

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as { places?: PlaceSummary[] };
    return body.places ?? [];
  } catch {
    return [];
  }
}
