import { NextResponse } from "next/server";
import type { DetectionResponse } from "@/domain/detection/types";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

function emptyResponse(error: string): DetectionResponse {
  return { detections: [], bestDetection: null, error };
}

export async function POST(request: Request) {
  let incomingForm: FormData;
  try {
    incomingForm = await request.formData();
  } catch {
    return NextResponse.json(emptyResponse("Requisicao invalida."), {
      status: 400,
    });
  }

  const file = incomingForm.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(emptyResponse("Imagem obrigatoria."), {
      status: 400,
    });
  }

  const outgoingForm = new FormData();
  outgoingForm.set("file", file, file.name);
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(`${mlApiUrl}/detect`, {
      method: "POST",
      body: outgoingForm,
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
