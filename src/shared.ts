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
 * Parse a response body as JSON, returning the raw text when parsing fails.
 *
 * Returning raw text (instead of throwing) preserves backward compatibility
 * with v2, where `got` returned error responses as normal `AptosClientResponse`
 * objects. This lets the caller (e.g. the TS SDK) inspect the status code and
 * handle the error however it chooses.
 *
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns unknown shape; caller provides Res generic
export async function parseJsonSafely(res: Response): Promise<any> {
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
    return text;
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

/**
 * Convert a `Headers` instance to a plain `Record<string, string | string[]>`.
 *
 * This preserves backward compatibility with aptos-client v2, which
 * returned Node's `IncomingHttpHeaders` (a plain object) from the `got`
 * library. Consumers (e.g. the TS SDK) access headers via bracket
 * notation (`response.headers["x-aptos-cursor"]`), which only works on
 * plain objects — not on `Headers` instances.
 *
 * Multi-value `set-cookie` headers are returned as `string[]` to match
 * Node's `IncomingHttpHeaders` shape and avoid losing cookie boundaries.
 *
 * @internal
 */
export function headersToRecord(headers: Headers): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  if (typeof headers.getSetCookie === "function") {
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) {
      result["set-cookie"] = cookies;
    }
  }
  return result;
}
