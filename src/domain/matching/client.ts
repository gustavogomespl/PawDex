import type {
  AnalyzeSightingResponse,
  ConfirmSightingPayload,
  ConfirmSightingResponse,
} from "./types";

export async function analyzePetSighting(
  file: File,
  placeId: string,
): Promise<AnalyzeSightingResponse> {
  const formData = new FormData();
  formData.set("file", file, file.name);
  formData.set("placeId", placeId);

  const response = await fetch("/api/analyze-sighting", {
    method: "POST",
    body: formData,
  });
  const body = (await response.json()) as AnalyzeSightingResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Matching failed.");
  }

  return body;
}

export async function confirmPetSighting(
  payload: ConfirmSightingPayload,
): Promise<ConfirmSightingResponse> {
  const response = await fetch("/api/confirm-sighting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as ConfirmSightingResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Confirmation failed.");
  }

  return body;
}
