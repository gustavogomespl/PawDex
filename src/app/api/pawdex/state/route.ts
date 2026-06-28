import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";
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

function stateLoadError(status: number): string {
  if (status === 401) {
    return "Nao autenticado.";
  }

  if (status === 403) {
    return "Sem permissao para acessar este lugar.";
  }

  if (status === 404) {
    return "Local nao encontrado.";
  }

  return "Nao foi possivel carregar a PawDex agora.";
}

function stateLoadStatus(status: number): number {
  return [401, 403, 404].includes(status) ? status : 502;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId");

  if (placeId === null || placeId.trim() === "") {
    return NextResponse.json(emptyState("Local obrigatorio."), {
      status: 400,
    });
  }

  const session = await auth();
  const userId = session?.user?.id;
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;
  const target =
    `${mlApiUrl}/places/${encodeURIComponent(placeId)}/state` +
    (userId ? `?user_id=${encodeURIComponent(userId)}` : "");

  try {
    const response = await fetch(target, { headers: internalApiHeaders() });

    if (!response.ok) {
      return NextResponse.json(emptyState(stateLoadError(response.status)), {
        status: stateLoadStatus(response.status),
      });
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      emptyState("Nao foi possivel carregar a PawDex agora."),
      { status: 502 },
    );
  }
}
