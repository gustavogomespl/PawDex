import { NextResponse } from "next/server";
import type {
  ConfirmSightingPayload,
  ConfirmSightingResponse,
} from "@/domain/matching/types";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

function emptyResponse(error: string): ConfirmSightingResponse {
  return {
    state: { places: [], animals: [], sightings: [], albumSlots: [] },
    selectedAnimalId: "",
    error,
  };
}

export async function POST(request: Request) {
  const payload = (await request.json()) as ConfirmSightingPayload;
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(`${mlApiUrl}/confirm-sighting`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return NextResponse.json(
        emptyResponse("Nao foi possivel confirmar o avistamento agora."),
        { status: 502 },
      );
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      emptyResponse("Nao foi possivel confirmar o avistamento agora."),
      { status: 502 },
    );
  }
}
