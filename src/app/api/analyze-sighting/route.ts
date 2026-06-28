import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";
import type { AnalyzeSightingResponse } from "@/domain/matching/types";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

function emptyResponse(error: string): AnalyzeSightingResponse {
  return {
    analysisId: null,
    detection: null,
    embedding: null,
    matches: [],
    recommendation: "no_pet_detected",
    error,
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(emptyResponse("Nao autenticado."), { status: 401 });
  }

  let incomingForm: FormData;
  try {
    incomingForm = await request.formData();
  } catch {
    return NextResponse.json(emptyResponse("Requisicao invalida."), {
      status: 400,
    });
  }

  const file = incomingForm.get("file");
  const placeId = incomingForm.get("placeId");

  if (!(file instanceof File)) {
    return NextResponse.json(emptyResponse("Imagem obrigatoria."), {
      status: 400,
    });
  }

  if (typeof placeId !== "string" || placeId.trim() === "") {
    return NextResponse.json(emptyResponse("Local obrigatorio."), {
      status: 400,
    });
  }

  const outgoingForm = new FormData();
  outgoingForm.set("file", file, file.name);
  outgoingForm.set("place_id", placeId);
  outgoingForm.set("user_id", session.user.id);
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(`${mlApiUrl}/analyze-sighting`, {
      method: "POST",
      body: outgoingForm,
      headers: internalApiHeaders(),
    });

    if (!response.ok) {
      return NextResponse.json(
        emptyResponse("Nao foi possivel analisar a imagem agora."),
        { status: 502 },
      );
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      emptyResponse("Nao foi possivel analisar a imagem agora."),
      { status: 502 },
    );
  }
}
