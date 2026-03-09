/**
 * Node.js HTTP client backed by {@link https://undici.nodejs.org | undici}.
 *
 * @remarks
 * This entry point is selected when the package is imported from Node.js
 * (via the `"node"` export condition). It uses undici's `Agent` with
 * configurable HTTP/2 support (`allowH2`). Agents are cached per origin
 * so connections are reused across requests to the same host.
 *
 * @module index.node
 */
import { Agent } from "undici";
import { CookieJar } from "./cookieJar";
import type { AptosClientRequest, AptosClientResponse, CookieJarLike } from "./types";

export { CookieJar } from "./cookieJar";
export type { CookieJarLike } from "./types";

const defaultCookieJar = new CookieJar();

/** One dispatcher per origin + HTTP/2 mode for connection reuse. */
const dispatcherCache = new Map<string, Agent>();
const MAX_DISPATCHERS = 50;

/**
 * Send a JSON request to an Aptos API endpoint.
 *
 * This is the default export and the primary entry point for most callers.
 *
 * @typeParam Res - Expected shape of the JSON response body.
 * @param requestOptions - Request configuration.
 * @returns Parsed response with status, headers, and deserialized body.
 *
 * @example
 * ```ts
 * import aptosClient from "@aptos-labs/aptos-client";
 *
 * const { data } = await aptosClient<{ chain_id: number }>({
 *   url: "https://fullnode.mainnet.aptoslabs.com/v1",
 *   method: "GET",
 * });
 * ```
 */
export default async function aptosClient<Res>(requestOptions: AptosClientRequest): Promise<AptosClientResponse<Res>> {
  return jsonRequest(requestOptions);
}

/**
 * Send a request and parse the response as JSON.
 *
 * Identical to the default export; useful when a named import is preferred.
 *
 * @typeParam Res - Expected shape of the JSON response body.
 * @param requestOptions - Request configuration.
 */
export async function jsonRequest<Res>(requestOptions: AptosClientRequest): Promise<AptosClientResponse<Res>> {
  return await doRequest(requestOptions, "json");
}

/**
 * Send a request and return the response as an `ArrayBuffer`.
 *
 * Intended for BCS-encoded responses from the Aptos API.
 *
 * @experimental
 * @param requestOptions - Request configuration.
 */
export async function bcsRequest(requestOptions: AptosClientRequest): Promise<AptosClientResponse<ArrayBuffer>> {
  return await doRequest(requestOptions, "arrayBuffer");
}

/** @internal */
type ResponseMode = "json" | "arrayBuffer";

/**
 * Core request handler shared by {@link jsonRequest} and {@link bcsRequest}.
 * @internal
 */
async function doRequest<Res>(
  requestOptions: AptosClientRequest,
  mode: ResponseMode,
): Promise<AptosClientResponse<Res>> {
  const { url, method, params, headers, body, http2 = true } = requestOptions;
  const jar = requestOptions.cookieJar ?? defaultCookieJar;

  if (method !== "GET" && method !== "POST") {
    throw new Error(`Unsupported method: ${method}`);
  }

  const requestUrl = buildUrl(url, params);
  const requestHeaders = buildHeaders(requestUrl, headers, jar);
  const dispatcher = getDispatcher(requestUrl.origin, http2);

  const init: RequestInit & { dispatcher?: Agent } = {
    method,
    headers: requestHeaders,
    dispatcher,
  };

  if (body !== undefined) {
    init.body = serializeBody(body);
    if (!(body instanceof Uint8Array) && !requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }
  }

  const res = await fetch(requestUrl, init);

  applySetCookieHeaders(requestUrl, res.headers, jar);

  const data = mode === "json" ? await parseJsonSafely(res, requestUrl) : await res.arrayBuffer();

  return {
    status: res.status,
    statusText: res.statusText,
    data,
    config: init,
    request: {
      url: requestUrl.toString(),
      method,
    },
    response: res,
    headers: res.headers,
  };
}

/**
 * Return a cached undici `Agent` for the given origin, creating one if needed.
 *
 * @param origin - URL origin (scheme + host + port).
 * @param http2 - Whether to enable HTTP/2 via ALPN (`allowH2`).
 * @internal
 */
function getDispatcher(origin: string, http2: boolean): Agent {
  const key = `${origin}|h2=${http2}`;
  const cached = dispatcherCache.get(key);
  if (cached) {
    // Move to end of Map (most-recently-used)
    dispatcherCache.delete(key);
    dispatcherCache.set(key, cached);
    return cached;
  }

  // Evict oldest entry if cache is full
  if (dispatcherCache.size >= MAX_DISPATCHERS) {
    // biome-ignore lint/style/noNonNullAssertion: cache size check guarantees entry exists
    const oldest = dispatcherCache.keys().next().value!;
    // biome-ignore lint/style/noNonNullAssertion: oldest key was just retrieved from cache
    dispatcherCache
      .get(oldest)!
      .destroy()
      .catch(() => {});
    dispatcherCache.delete(oldest);
  }

  const agent = new Agent({
    allowH2: http2,
  });

  dispatcherCache.set(key, agent);
  return agent;
}

/**
 * Build a `URL` from the base string and optional query parameters.
 * `bigint` values in `params` are converted to strings automatically.
 * @internal
 */
function buildUrl(url: string, params?: AptosClientRequest["params"]): URL {
  const requestUrl = new URL(url);

  Object.entries(convertBigIntToString(params)).forEach(([key, value]) => {
    if (value !== undefined) {
      requestUrl.searchParams.append(key, String(value));
    }
  });

  return requestUrl;
}

/**
 * Merge caller-supplied headers with cookies from the jar.
 * @internal
 */
function buildHeaders(url: URL, headers: AptosClientRequest["headers"] | undefined, jar: CookieJarLike): Headers {
  const result = new Headers();

  Object.entries(headers ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      result.set(key, String(value));
    }
  });

  const cookies = jar.getCookies(url);
  if (cookies.length > 0) {
    const jarCookies = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const existing = result.get("cookie");
    result.set("cookie", existing ? `${existing}; ${jarCookies}` : jarCookies);
  }

  return result;
}

/**
 * Serialize a request body to a `BodyInit`-compatible value.
 * `Uint8Array` is passed directly (it is a valid `ArrayBufferView`/`BodyInit`);
 * everything else is JSON-stringified.
 * @internal
 */
function serializeBody(body: Record<string, unknown> | Uint8Array): BodyInit {
  if (body instanceof Uint8Array) {
    // Uint8Array is a valid BodyInit at runtime (ArrayBufferView), cast for TS compatibility
    return body as unknown as BodyInit;
  }
  return JSON.stringify(body);
}

/**
 * Parse a response body as JSON, returning `null` for empty or no-content responses.
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns unknown shape; caller provides Res generic
async function parseJsonSafely(res: Response, url: URL): Promise<any> {
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
    const err = new Error(`Failed to parse JSON response from ${url.pathname} (status ${res.status})`);
    Object.defineProperty(err, "responseBody", { value: text.slice(0, 200), enumerable: false });
    throw err;
  }
}

/** Store any `Set-Cookie` headers from the response in the cookie jar. @internal */
function applySetCookieHeaders(url: URL, headers: Headers, jar: CookieJarLike): void {
  for (const cookie of headers.getSetCookie()) {
    jar.setCookie(url, cookie);
  }
}

/**
 * Convert `bigint` values to strings so they can be passed to `URLSearchParams`.
 * @internal
 */
function convertBigIntToString(
  obj: AptosClientRequest["params"],
): Record<string, string | number | boolean | undefined> {
  const result: Record<string, string | number | boolean | undefined> = {};
  if (!obj) return result;

  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === "bigint") {
      result[key] = String(value);
    } else {
      result[key] = value;
    }
  });

  return result;
}
