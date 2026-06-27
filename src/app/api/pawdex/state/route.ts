import { NextResponse } from "next/server";
import type { PawDexState } from "@/domain/pawdex/types";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

type PawDexStateError = PawDexState & { error: string };

function emptyState(error: string): PawDexStateError {
  return {
    places: [],
    animals: [],
    sightings: [],
    albumSlots: [],
    error,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId");

  if (placeId === null || placeId.trim() === "") {
    return NextResponse.json(emptyState("Local obrigatorio."), {
      status: 400,
    });
  }

  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(
      `${mlApiUrl}/places/${encodeURIComponent(placeId)}/state`,
    );

    if (!response.ok) {
      return NextResponse.json(
        emptyState("Nao foi possivel carregar a PawDex agora."),
        { status: 502 },
      );
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      emptyState("Nao foi possivel carregar a PawDex agora."),
      { status: 502 },
    );
  }
}
