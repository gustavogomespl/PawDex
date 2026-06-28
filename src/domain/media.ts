/**
 * Resolve a stored photo reference to a renderable <img src>.
 *
 * Object-storage keys (e.g. "crops/abc.jpg") are served through the authorized
 * /api/media proxy. Absolute URLs (seed data), data URLs (local previews) and
 * absolute paths are returned unchanged.
 */
export function mediaSrc(reference: string): string {
  if (!reference) {
    return reference;
  }
  if (
    reference.startsWith("http://") ||
    reference.startsWith("https://") ||
    reference.startsWith("data:") ||
    reference.startsWith("/")
  ) {
    return reference;
  }
  return `/api/media/${reference}`;
}
