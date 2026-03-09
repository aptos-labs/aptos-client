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
import type { AptosClientRequest, AptosClientResponse } from "./types";

const cookieJar = new CookieJar();

/** One dispatcher per origin + HTTP/2 mode for connection reuse. */
const dispatcherCache = new Map<string, Agent>();

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

  if (method !== "GET" && method !== "POST") {
    throw new Error(`Unsupported method: ${method}`);
  }

  const requestUrl = buildUrl(url, params);
  const requestHeaders = buildHeaders(requestUrl, headers);
  const dispatcher = getDispatcher(requestUrl.origin, http2);

  const init: RequestInit & { dispatcher?: Agent } = {
    method,
    headers: requestHeaders,
    dispatcher,
  };

  if (body !== undefined) {
    init.body = serializeBody(body);
  }

  const res = await fetch(requestUrl, init);

  applySetCookieHeaders(requestUrl, res.headers);

  const data = mode === "json" ? await parseJsonSafely(res) : await res.arrayBuffer();

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
  if (cached) return cached;

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
function buildUrl(url: string, params?: Record<string, any>): URL {
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
function buildHeaders(url: URL, headers?: Record<string, any>): Headers {
  const result = new Headers();

  Object.entries(headers ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      result.set(key, String(value));
    }
  });

  const cookies = cookieJar.getCookies(url);
  if (cookies.length > 0) {
    result.set("cookie", cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "));
  }

  return result;
}

/**
 * Serialize a request body to a `BodyInit`-compatible value.
 * `Uint8Array` is unwrapped to its backing `ArrayBuffer`; everything else is JSON-stringified.
 * @internal
 */
function serializeBody(body: any): BodyInit {
  if (body instanceof Uint8Array) {
    return body.buffer as ArrayBuffer;
  }

  const json = JSON.stringify(body);

  // fetch requires BodyInit, and string is fine for JSON payloads.
  return json;
}

/**
 * Parse a response body as JSON, returning `null` for empty or no-content responses.
 * @internal
 */
async function parseJsonSafely(res: Response): Promise<any> {
  // Matches the spirit of the current client: return parsed data for JSON paths.
  // For empty bodies, return null rather than throwing on res.json().
  if (res.status === 204 || res.status === 205) {
    return null;
  }

  const text = await res.text();
  if (text.length === 0) {
    return null;
  }

  return JSON.parse(text);
}

/** Store any `Set-Cookie` headers from the response in the cookie jar. @internal */
function applySetCookieHeaders(url: URL, headers: Headers): void {
  const setCookies = getSetCookieValues(headers);
  for (const cookie of setCookies) {
    cookieJar.setCookie(url, cookie);
  }
}

/**
 * Extract `Set-Cookie` values from response headers.
 * Prefers the non-standard `getSetCookie()` method (Node 20+/undici), falling
 * back to the single collapsed `set-cookie` header.
 * @internal
 */
function getSetCookieValues(headers: Headers): string[] {
  // Node/Undici exposes non-standard headers.getSetCookie() in modern runtimes.
  const maybeGetSetCookie = (
    headers as Headers & {
      getSetCookie?: () => string[];
    }
  ).getSetCookie;

  if (typeof maybeGetSetCookie === "function") {
    return maybeGetSetCookie.call(headers);
  }

  // Fallback for environments that collapse to a single header string.
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * Convert `bigint` values to strings so they can be passed to `URLSearchParams`.
 * @internal
 */
function convertBigIntToString(obj: any): any {
  const result: any = {};
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
