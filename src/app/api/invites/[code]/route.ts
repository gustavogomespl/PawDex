import { NextResponse } from "next/server";
import { internalApiHeaders } from "@/domain/auth/internal";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(
      `${mlApiUrl}/invites/${encodeURIComponent(code)}`,
      { cache: "no-store", headers: internalApiHeaders() },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Convite invalido." },
        { status: response.status === 404 ? 404 : 502 },
      );
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Falha ao resolver convite." }, {
      status: 502,
    });
  }
}
