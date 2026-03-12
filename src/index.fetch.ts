/**
 * Fetch-based HTTP client for runtimes with native HTTP/2 support.
 *
 * @remarks
 * Used by Deno, Bun, React Native, and any other runtime that provides a
 * spec-compliant `fetch()`. These runtimes negotiate HTTP/2 automatically
 * via ALPN, so the {@link AptosClientRequest.http2 | http2} option is
 * ignored.
 *
 * @module index.fetch
 */
import { CookieJar } from "./cookieJar";
import {
  applyCookiesToHeaders,
  applyJsonContentType,
  buildUrl,
  parseJsonSafely,
  serializeBody,
  storeResponseCookies,
} from "./shared";
import type { AptosClientRequest, AptosClientResponse } from "./types";

export { CookieJar } from "./cookieJar";
export type { CookieJarLike } from "./types";

const defaultCookieJar = new CookieJar();

let http2Warned = false;

/**
 * Send a JSON request to an Aptos API endpoint.
 *
 * This is the default export and the primary entry point for most callers.
 *
 * @typeParam Res - Expected shape of the JSON response body.
 * @param options - Request configuration.
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
export default async function aptosClient<Res>(options: AptosClientRequest): Promise<AptosClientResponse<Res>> {
  return jsonRequest<Res>(options);
}

/**
 * Send a request and parse the response as JSON.
 *
 * Identical to the default export; useful when a named import is preferred.
 *
 * @typeParam Res - Expected shape of the JSON response body.
 * @param options - Request configuration.
 */
export async function jsonRequest<Res>(options: AptosClientRequest): Promise<AptosClientResponse<Res>> {
  const { requestUrl, requestConfig, jar } = buildRequest(options);

  const res = await fetch(requestUrl, requestConfig);
  storeResponseCookies(new URL(requestUrl), res.headers, jar);
  const data = await parseJsonSafely(res, requestUrl);

  return {
    status: res.status,
    statusText: res.statusText,
    data,
    headers: res.headers,
    config: requestConfig,
  };
}

/**
 * Send a request and return the response as an `ArrayBuffer`.
 *
 * Intended for BCS-encoded responses from the Aptos API.
 *
 * @experimental
 * @param options - Request configuration.
 */
export async function bcsRequest(options: AptosClientRequest): Promise<AptosClientResponse<ArrayBuffer>> {
  const { requestUrl, requestConfig, jar } = buildRequest(options);

  const res = await fetch(requestUrl, requestConfig);
  storeResponseCookies(new URL(requestUrl), res.headers, jar);
  const data = await res.arrayBuffer();

  return {
    status: res.status,
    statusText: res.statusText,
    data,
    headers: res.headers,
    config: requestConfig,
  };
}

/** Build the URL and `RequestInit` from the caller's options. @internal */
function buildRequest(options: AptosClientRequest) {
  if (options.method !== "GET" && options.method !== "POST") {
    throw new Error(`Unsupported method: ${options.method}`);
  }

  if (!http2Warned && options.http2 !== undefined) {
    http2Warned = true;
    console.warn("[aptos-client] The `http2` option is only supported by the Node entry point and is ignored here.");
  }

  const jar = options.cookieJar ?? defaultCookieJar;

  const headers = new Headers();
  for (const [key, value] of Object.entries(options?.headers ?? {})) {
    if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const requestUrl = buildUrl(options.url, options.params);

  applyCookiesToHeaders(headers, requestUrl, jar);

  const body = serializeBody(options.body);
  if (body !== undefined) {
    applyJsonContentType(options.body, headers);
  }

  const requestConfig: RequestInit = {
    method: options.method,
    headers,
    body,
  };

  return { requestUrl: requestUrl.toString(), requestConfig, jar };
}
