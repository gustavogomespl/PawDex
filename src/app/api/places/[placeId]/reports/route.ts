import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { reports: [], error: "Nao autenticado." },
      { status: 401 },
    );
  }

  const { placeId } = await params;
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(
      `${mlApiUrl}/places/${encodeURIComponent(placeId)}/reports?user_id=${encodeURIComponent(session.user.id)}`,
      { cache: "no-store", headers: internalApiHeaders() },
    );
    const data = await response.json().catch(() => ({ reports: [] }));
    return NextResponse.json(data, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json(
      { reports: [], error: "Falha ao carregar denuncias." },
      { status: 502 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { placeId } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requisicao invalida." }, { status: 400 });
  }

  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;
  try {
    const response = await fetch(
      `${mlApiUrl}/places/${encodeURIComponent(placeId)}/reports`,
      {
        method: "POST",
        headers: internalApiHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ ...body, userId: session.user.id }),
      },
    );
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json({ error: "Falha ao enviar denuncia." }, { status: 502 });
  }
}
