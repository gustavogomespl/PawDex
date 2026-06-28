import { internalApiHeaders } from "@/domain/auth/internal";

export type SyncedUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type AuthMode = "signin" | "signup";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

type AuthEnv = {
  NODE_ENV?: string;
  PAWDEX_ENABLE_DEV_AUTH?: string;
};

export function isDevEmailAuthEnabled(env: AuthEnv = process.env): boolean {
  const flag = env.PAWDEX_ENABLE_DEV_AUTH?.trim().toLowerCase();

  if (flag === "true") {
    return true;
  }

  if (flag === "false") {
    return false;
  }

  return env.NODE_ENV !== "production";
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const email = raw.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export function normalizeDisplayName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const name = raw.trim().replace(/\s+/g, " ");
  return name.length > 0 ? name : null;
}

export function resolveAuthMode(
  rawMode: unknown,
  normalizedDisplayName: string | null,
): AuthMode {
  if (rawMode === "signup" || normalizedDisplayName) {
    return "signup";
  }

  return "signin";
}

async function postUserAuth(
  path: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  mlApiUrl: string,
): Promise<SyncedUser> {
  const response = await fetchImpl(`${mlApiUrl}${path}`, {
    method: "POST",
    headers: internalApiHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Falha ao autenticar usuario.");
  }

  return (await response.json()) as SyncedUser;
}

export async function syncUser(
  email: string,
  name: string | null,
  fetchImpl: typeof fetch = fetch,
  mlApiUrl: string = process.env.ML_API_URL ?? DEFAULT_ML_API_URL,
): Promise<SyncedUser> {
  const response = await fetchImpl(`${mlApiUrl}/users/sync`, {
    method: "POST",
    headers: internalApiHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ email, name }),
  });

  if (!response.ok) {
    throw new Error("Falha ao sincronizar usuario com o servidor.");
  }

  return (await response.json()) as SyncedUser;
}

export async function registerUser(
  email: string,
  name: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
  mlApiUrl: string = process.env.ML_API_URL ?? DEFAULT_ML_API_URL,
): Promise<SyncedUser> {
  return postUserAuth(
    "/users/register",
    { email, name, password },
    fetchImpl,
    mlApiUrl,
  );
}

export async function authenticateUser(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
  mlApiUrl: string = process.env.ML_API_URL ?? DEFAULT_ML_API_URL,
): Promise<SyncedUser> {
  return postUserAuth("/users/login", { email, password }, fetchImpl, mlApiUrl);
}

type PasswordCredentials = {
  email?: unknown;
  mode?: unknown;
  name?: unknown;
  password?: unknown;
};

type PasswordAuthDependencies = {
  registerUser?: (
    email: string,
    name: string,
    password: string,
  ) => Promise<SyncedUser>;
  authenticateUser?: (email: string, password: string) => Promise<SyncedUser>;
};

export async function authorizePasswordCredentials(
  credentials: PasswordCredentials | null | undefined,
  dependencies: PasswordAuthDependencies = {},
): Promise<SyncedUser | null> {
  const email = normalizeEmail(
    typeof credentials?.email === "string" ? credentials.email : null,
  );
  const password =
    typeof credentials?.password === "string" ? credentials.password : null;
  const name = normalizeDisplayName(
    typeof credentials?.name === "string" ? credentials.name : null,
  );
  const mode = resolveAuthMode(credentials?.mode, name);

  if (!email || !password || password.length < 8) {
    return null;
  }

  try {
    if (mode === "signup") {
      if (!name) {
        return null;
      }
      return await (dependencies.registerUser ?? registerUser)(
        email,
        name,
        password,
      );
    }

    return await (dependencies.authenticateUser ?? authenticateUser)(email, password);
  } catch {
    return null;
  }
}
