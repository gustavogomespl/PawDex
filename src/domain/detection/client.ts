import type { DetectionResponse } from "./types";

export async function detectPetImage(file: File): Promise<DetectionResponse> {
  const formData = new FormData();
  formData.set("file", file, file.name);

  const response = await fetch("/api/detect", {
    method: "POST",
    body: formData,
  });
  const body = (await response.json()) as DetectionResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Detection failed.");
  }

  return body;
}
