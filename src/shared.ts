/**
 * Shared utilities used by all entry points (Node, fetch, browser).
 *
 * @remarks
 * Extracted to a single module so that parsing, serialization, URL building,
 * and cookie logic stay consistent across runtimes.
 *
 * @internal
 * @module shared
 */
import type { AptosClientRequest, CookieJarLike } from "./types";

/**
 * Build a `URL` from a base string and optional query parameters.
 * `bigint` values are stringified automatically via `String()`.
 * @internal
 */
export function buildUrl(base: string, params?: AptosClientRequest["params"]): URL {
  const url = new URL(base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        // String(value) correctly handles bigint: String(12345n) === "12345"
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url;
}

/**
 * Serialize a request body to a `BodyInit`-compatible value.
 *
 * - `null` / `undefined` → `undefined` (no body sent)
 * - `Uint8Array` → passed through (valid `ArrayBufferView`/`BodyInit`)
 * - Anything else → `JSON.stringify`
 *
 * @internal
 */
export function serializeBody(body: unknown): BodyInit | undefined {
  if (body == null) return undefined;
  if (body instanceof Uint8Array) {
    // Uint8Array is a valid BodyInit at runtime (ArrayBufferView), cast for TS compatibility
    return body as unknown as BodyInit;
  }
  return JSON.stringify(body);
}

/**
 * Set the `content-type` header to `application/json` when the body is
 * a non-binary, non-null value and no content-type has been set already.
 * @internal
 */
export function applyJsonContentType(body: unknown, headers: Headers): void {
  if (body != null && !(body instanceof Uint8Array) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
}

/**
 * Parse a response body as JSON, returning `null` for empty or no-content responses.
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns unknown shape; caller provides Res generic
export async function parseJsonSafely(res: Response, url: string | URL): Promise<any> {
  if (res.status === 204 || res.status === 205) {
    return null;
  }
  const text = await res.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    const pathname = typeof url === "string" ? new URL(url).pathname : url.pathname;
    const err = new Error(`Failed to parse JSON response from ${pathname} (status ${res.status})`);
    Object.defineProperty(err, "responseBody", { value: text.slice(0, 200), enumerable: false });
    throw err;
  }
}

/**
 * Merge cookies from a {@link CookieJarLike} into the request headers.
 * @internal
 */
export function applyCookiesToHeaders(headers: Headers, url: URL, jar: CookieJarLike): void {
  const cookies = jar.getCookies(url);
  if (cookies.length > 0) {
    const jarCookies = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const existing = headers.get("cookie");
    headers.set("cookie", existing ? `${existing}; ${jarCookies}` : jarCookies);
  }
}

/**
 * Store any `Set-Cookie` headers from the response in the cookie jar.
 *
 * Includes a defensive check for `Headers.getSetCookie()` availability,
 * since it may be absent in some React Native environments.
 * @internal
 */
export function storeResponseCookies(url: URL, headers: Headers, jar: CookieJarLike): void {
  if (typeof headers.getSetCookie !== "function") return;
  for (const cookie of headers.getSetCookie()) {
    jar.setCookie(url, cookie);
  }
}
