/**
 * Browser HTTP client using the native `fetch()` API.
 *
 * @remarks
 * Selected via the `"browser"` export condition. HTTP/2 negotiation is
 * handled by the browser engine — the {@link AptosClientRequest.http2 | http2}
 * option is ignored. Cookie handling is delegated to the browser; this entry
 * point does not use a {@link CookieJar}.
 *
 * The `credentials` mode on each request is controlled via
 * `overrides.WITH_CREDENTIALS` (`false` → `"omit"`,
 * default/`true` → `"include"`).
 *
 * @module index.browser
 */
import { applyJsonContentType, buildUrl, parseJsonSafely, serializeBody } from "./shared";
import type { AptosClientRequest, AptosClientResponse } from "./types";

let http2Warned = false;

/**
 * Send a JSON request to an Aptos API endpoint.
 *
 * This is the default export and the primary entry point for most callers.
 *
 * @typeParam Res - Expected shape of the JSON response body.
 * @param options - Request configuration.
 * @returns Parsed response with status, headers, and deserialized body.
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
  const { requestUrl, requestConfig } = buildRequest(options);

  const res = await fetch(requestUrl, requestConfig);
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
  const { requestUrl, requestConfig } = buildRequest(options);

  const res = await fetch(requestUrl, requestConfig);
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

  const headers = new Headers();
  for (const [key, value] of Object.entries(options?.headers ?? {})) {
    if (value !== undefined) {
      headers.set(key, String(value));
    }
  }

  const body = serializeBody(options.body);
  if (body !== undefined) {
    applyJsonContentType(options.body, headers);
  }

  const credentials: RequestCredentials = options.overrides?.WITH_CREDENTIALS === false ? "omit" : "include";

  const requestConfig: RequestInit = {
    method: options.method,
    headers,
    body,
    credentials,
  };

  const requestUrl = buildUrl(options.url, options.params);

  return { requestUrl: requestUrl.toString(), requestConfig };
}
