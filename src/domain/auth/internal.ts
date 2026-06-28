/**
 * Header used to authenticate the Next.js server to the ML API. When
 * PAWDEX_INTERNAL_TOKEN is unset (local/tests) no header is added and the ML API
 * skips the check; in production both sides set it so the ML API only trusts the
 * Next.js proxy.
 */
export function internalApiHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const token = process.env.PAWDEX_INTERNAL_TOKEN;
  return {
    ...(token ? { "x-internal-token": token } : {}),
    ...(extra ?? {}),
  };
}
