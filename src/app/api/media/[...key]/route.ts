import { auth } from "@/auth";
import { internalApiHeaders } from "@/domain/auth/internal";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { key } = await params;
  const keyPath = key.map(encodeURIComponent).join("/");
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(`${mlApiUrl}/media/${keyPath}`, {
      cache: "no-store",
      headers: internalApiHeaders(),
    });

    if (!response.ok) {
      return new Response("Not found", { status: response.status });
    }

    const body = await response.arrayBuffer();
    return new Response(body, {
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Bad gateway", { status: 502 });
  }
}
