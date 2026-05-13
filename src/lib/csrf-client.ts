/**
 * Client-only helper used by every fetch() that calls a CSRF-protected
 * `/api/*` route. Reads the (non-HttpOnly) `csrf_token` cookie and turns it
 * into the `x-csrf-token` header the server expects.
 *
 * Marked "use client"-friendly: this file is pure DOM. Server bundles that
 * accidentally import it will get an empty object during SSR because
 * `document` is undefined; calling `csrfHeaders()` server-side returns `{}`.
 */

export function csrfHeaders(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const cookie = document.cookie.split(/;\s*/).find((p) => p.startsWith("csrf_token="));
  if (!cookie) return {};
  const eq = cookie.indexOf("=");
  return { "x-csrf-token": decodeURIComponent(cookie.slice(eq + 1)) };
}
