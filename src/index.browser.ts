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
 * `overrides.WITH_CREDENTIALS` (`true` → `"include"`, `false` → `"omit"`,
 * default `"include"`).
 *
 * @module index.browser
 */
import type { AptosClientRequest, AptosClientResponse } from "./types";

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

/** Parse JSON safely, returning `null` for empty or no-content responses. @internal */
async function parseJsonSafely(res: Response, url: string): Promise<any> {
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
    const pathname = new URL(url).pathname;
    throw new Error(`Failed to parse JSON response from ${pathname} (status ${res.status}): ${text.slice(0, 200)}`);
  }
}

/** Build the URL and `RequestInit` from the caller's options. @internal */
function buildRequest(options: AptosClientRequest) {
  const headers = new Headers();
  Object.entries(options?.headers ?? {}).forEach(([key, value]) => {
    headers.append(key, String(value));
  });

  const body =
    options.body instanceof Uint8Array
      ? (options.body.buffer as ArrayBuffer).slice(
          options.body.byteOffset,
          options.body.byteOffset + options.body.byteLength,
        )
      : options.body
        ? JSON.stringify(options.body)
        : undefined;

  const withCredentialsOption = options.overrides?.WITH_CREDENTIALS;
  let credentials: RequestCredentials;
  if (withCredentialsOption === false) {
    credentials = "omit";
  } else if (withCredentialsOption === true) {
    credentials = "include";
  } else {
    credentials = withCredentialsOption ?? "include";
  }

  const requestConfig: RequestInit = {
    method: options.method,
    headers,
    body,
    credentials,
  };

  const params = new URLSearchParams();
  Object.entries(options.params ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  });

  const requestUrl = options.url + (params.size > 0 ? `?${params.toString()}` : "");

  return { requestUrl, requestConfig };
}
