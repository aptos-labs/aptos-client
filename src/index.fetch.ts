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
import type { AptosClientRequest, AptosClientResponse } from "./types";

const cookieJar = new CookieJar();

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
  const { requestUrl, requestConfig } = buildRequest(options);

  const res = await fetch(requestUrl, requestConfig);
  handleSetCookieHeaders(res, requestUrl);
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
  handleSetCookieHeaders(res, requestUrl);
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
  const headers = new Headers();
  for (const [key, value] of Object.entries(options?.headers ?? {})) {
    if (value !== undefined) {
      headers.append(key, String(value));
    }
  }

  // Build URL once — used for cookie lookup and query params
  const requestUrl = new URL(options.url);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined) {
      requestUrl.searchParams.append(key, String(value));
    }
  }

  // Inject cookies from the jar (merge with any caller-supplied Cookie header)
  const cookies = cookieJar.getCookies(requestUrl);
  if (cookies.length > 0) {
    const jarCookies = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const existing = headers.get("cookie");
    headers.set("cookie", existing ? `${existing}; ${jarCookies}` : jarCookies);
  }

  const body =
    options.body instanceof Uint8Array
      ? (options.body.buffer as ArrayBuffer).slice(
          options.body.byteOffset,
          options.body.byteOffset + options.body.byteLength,
        )
      : options.body
        ? JSON.stringify(options.body)
        : undefined;

  const requestConfig: RequestInit = {
    method: options.method,
    headers,
    body,
  };

  return { requestUrl: requestUrl.toString(), requestConfig };
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

/** Store any `Set-Cookie` headers from the response in the cookie jar. @internal */
function handleSetCookieHeaders(res: Response, requestUrl: string) {
  // getSetCookie() is supported in Deno 1.33+, Bun 1.0+, Node 20+
  const setCookies = res.headers.getSetCookie?.();
  if (setCookies && setCookies.length > 0) {
    const url = new URL(requestUrl);
    for (const c of setCookies) {
      cookieJar.setCookie(url, c);
    }
  }
}
