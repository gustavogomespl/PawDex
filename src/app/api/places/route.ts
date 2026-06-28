import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ places: [], error: "Nao autenticado." }, {
      status: 401,
    });
  }

  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(
      `${mlApiUrl}/users/${encodeURIComponent(session.user.id)}/places`,
      { cache: "no-store", headers: internalApiHeaders() },
    );

    if (!response.ok) {
      return NextResponse.json({ places: [], error: "Falha ao listar lugares." }, {
        status: 502,
      });
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ places: [], error: "Falha ao listar lugares." }, {
      status: 502,
    });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requisicao invalida." }, { status: 400 });
  }

  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(`${mlApiUrl}/places`, {
      method: "POST",
      headers: internalApiHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ ...body, createdBy: session.user.id }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json(
      { error: "Nao foi possivel criar o lugar agora." },
      { status: 502 },
    );
  }
}
