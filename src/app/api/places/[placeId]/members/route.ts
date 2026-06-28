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
    return NextResponse.json({ members: [], error: "Nao autenticado." }, {
      status: 401,
    });
  }

  const { placeId } = await params;
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(
      `${mlApiUrl}/places/${encodeURIComponent(placeId)}/members?user_id=${encodeURIComponent(session.user.id)}`,
      { cache: "no-store", headers: internalApiHeaders() },
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json({ members: [], error: "Falha ao listar membros." }, {
      status: 502,
    });
  }
}
