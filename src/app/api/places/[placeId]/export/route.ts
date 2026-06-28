import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { placeId } = await params;
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(
      `${mlApiUrl}/places/${encodeURIComponent(placeId)}/export?user_id=${encodeURIComponent(session.user.id)}`,
      { cache: "no-store", headers: internalApiHeaders() },
    );
    if (!response.ok) {
      return new Response("Forbidden", { status: response.status });
    }
    const data = await response.json();
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="pawdex-${placeId}.json"`,
      },
    });
  } catch {
    return new Response("Bad gateway", { status: 502 });
  }
}
