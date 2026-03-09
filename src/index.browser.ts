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
    const err = new Error(`Failed to parse JSON response from ${pathname} (status ${res.status})`);
    Object.defineProperty(err, "responseBody", { value: text.slice(0, 200), enumerable: false });
    throw err;
  }
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
  Object.entries(options?.headers ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      headers.set(key, String(value));
    }
  });

  // Uint8Array is a valid BodyInit at runtime (ArrayBufferView) — no copy needed
  const body: BodyInit | undefined =
    options.body instanceof Uint8Array
      ? (options.body as unknown as BodyInit)
      : options.body
        ? JSON.stringify(options.body)
        : undefined;

  const credentials: RequestCredentials = options.overrides?.WITH_CREDENTIALS === false ? "omit" : "include";

  const requestConfig: RequestInit = {
    method: options.method,
    headers,
    body,
    credentials,
  };

  const requestUrl = new URL(options.url);
  Object.entries(options.params ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      // String(value) correctly handles bigint: String(12345n) === "12345"
      requestUrl.searchParams.append(key, String(value));
    }
  });

  return { requestUrl: requestUrl.toString(), requestConfig };
}
