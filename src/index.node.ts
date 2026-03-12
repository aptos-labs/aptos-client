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
import {
  applyCookiesToHeaders,
  applyJsonContentType,
  buildUrl,
  parseJsonSafely,
  serializeBody,
  storeResponseCookies,
} from "./shared";
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

  const serialized = serializeBody(body);
  if (serialized !== undefined) {
    init.body = serialized;
    applyJsonContentType(body, requestHeaders);
  }

  const res = await fetch(requestUrl, init);

  storeResponseCookies(requestUrl, res.headers, jar);

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
 * Merge caller-supplied headers with cookies from the jar.
 * @internal
 */
function buildHeaders(url: URL, headers: AptosClientRequest["headers"] | undefined, jar: CookieJarLike): Headers {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value !== undefined) {
      result.set(key, String(value));
    }
  }

  applyCookiesToHeaders(result, url, jar);

  return result;
}
