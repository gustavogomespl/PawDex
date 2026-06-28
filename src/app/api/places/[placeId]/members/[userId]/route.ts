import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ placeId: string; userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { placeId, userId } = await params;

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Requisicao invalida." }, { status: 400 });
  }

  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(
      `${mlApiUrl}/places/${encodeURIComponent(placeId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "POST",
        headers: internalApiHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ userId: session.user.id, status: body.status }),
      },
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json({ error: "Falha ao atualizar membro." }, {
      status: 502,
    });
  }
}
