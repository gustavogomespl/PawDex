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
  let payload: ConfirmSightingPayload;

  try {
    const parsedPayload = (await request.json()) as unknown;

    if (
      typeof parsedPayload !== "object" ||
      parsedPayload === null ||
      Array.isArray(parsedPayload)
    ) {
      return NextResponse.json(emptyResponse("Confirmacao invalida."), {
        status: 400,
      });
    }

    payload = parsedPayload as ConfirmSightingPayload;
  } catch {
    return NextResponse.json(emptyResponse("Confirmacao invalida."), {
      status: 400,
    });
  }

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
