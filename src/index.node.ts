/**
 * Node.js HTTP client backed by {@link https://github.com/sindresorhus/got | got}.
 *
 * @remarks
 * This entry point is selected when the package is imported from Node.js
 * (via the `"node"` export condition). It uses {@link got} for transport,
 * which provides:
 *
 *  - HTTP/2 negotiation via `http2-wrapper` (`http2: true`).
 *  - Transparent decompression of `br`, `gzip`, and `deflate` response bodies
 *    on both HTTP/1.1 and HTTP/2 (`decompress: true`, the default).
 *  - Built-in connection pooling — we don't manage our own dispatcher cache.
 *
 * Historical note: v3 of this package replaced `got` with `undici`, but the
 * `fetch + custom dispatcher` combination silently dropped response headers
 * (including `set-cookie`) and failed to decompress responses on H2 (and
 * via the fetch wrapper on H1 too). v4 returns to `got` because its body
 * pipeline handles decompression independent of the transport, which is the
 * only shape that works reliably with the Aptos fullnode (brotli) and
 * indexer (gzip) endpoints.
 *
 * @module index.node
 */
import { type IncomingMessage, STATUS_CODES } from "node:http";
import got, { HTTPError, RequestError } from "got";
import { CookieJar } from "./cookieJar.js";
import { buildUrl, serializeBody } from "./shared.js";
import type { AptosClientRequest, AptosClientResponse, CookieJarLike } from "./types.js";

export type { Cookie } from "./cookieJar.js";
export { CookieJar } from "./cookieJar.js";
export type { AptosClientRequest, AptosClientResponse, CookieJarLike } from "./types.js";

const textDecoder = new TextDecoder("utf-8");
const defaultCookieJar = new CookieJar();

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
  const requestHeaders = buildHeaders(requestUrl, headers, body, jar);
  // `serializeBody` returns string | Uint8Array | undefined; got accepts both as `body`.
  const serialized = serializeBody(body) as string | Uint8Array | undefined;

  let response: {
    body: Uint8Array<ArrayBuffer>;
    statusCode: number;
  } & IncomingMessage;
  try {
    response = await got(requestUrl, {
      method,
      headers: requestHeaders,
      body: serialized,
      http2,
      // Don't throw on 4xx/5xx — callers (e.g., the TS SDK) inspect the
      // status code and handle errors themselves. Matches v2 behavior.
      throwHttpErrors: false,
      // Disable retries; SDK callers manage their own retry policy.
      retry: { limit: 0 },
      // Body comes back as a Uint8Array; we decode JSON / hand back ArrayBuffer
      // ourselves so the empty-body and BCS cases stay consistent.
      responseType: "buffer",
      // `decompress: true` is the default — listed explicitly to make the
      // intent (transparent br/gzip/deflate decoding) visible.
      decompress: true,
      // got's H2 path (via http2-wrapper) sets its own TLS context and does
      // NOT inherit `NODE_TLS_REJECT_UNAUTHORIZED` from the env. Pass it
      // through explicitly, so the documented Node env var works as expected.
      https: {
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
      },
    });
  } catch (err) {
    // got throws for transport-level failures (DNS, ECONNREFUSED, parse errors).
    // HTTP 4xx/5xx do NOT throw thanks to throwHttpErrors: false. We preserve
    // a v2-compatible shape: if there's an attached response, surface it as a
    // normal AptosClientResponse so callers can read .status.
    if ((err instanceof HTTPError || err instanceof RequestError) && err.response) {
      response = err.response;
    } else {
      throw err;
    }
  }

  storeResponseCookies(requestUrl, response.headers, jar);

  // got's `responseType: "buffer"` returns a Uint8Array (not a Node Buffer)
  // in v15+.
  const raw = response.body;

  // TODO: at some point provide better type guarantees, since there is some legacy behavior in here
  // biome-ignore lint/suspicious/noExplicitAny: legacy behavior, union of multiple body shapes
  let data: any;
  if (mode === "arrayBuffer") {
    // Slice out a fresh ArrayBuffer that matches the body length exactly.
    data = response.body.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  } else if (response.statusCode === 204 || response.statusCode === 205 || response.body.byteLength === 0) {
    data = null;
  } else {
    const text = textDecoder.decode(response.body);
    try {
      data = JSON.parse(text);
    } catch {
      // Backward compat: return raw text so callers can inspect non-JSON bodies.
      data = text;
    }
  }

  return {
    status: response.statusCode,
    statusText: response.statusMessage ?? STATUS_CODES[response.statusCode] ?? "",
    data,
    config: {
      method,
      headers: requestHeaders,
      body: serialized,
    },
    request: {
      url: requestUrl.toString(),
      method,
    },
    response,
    headers: normalizeHeaders(response.headers),
  };
}

/**
 * Build the outgoing header record: caller-supplied headers, jar cookies,
 * and a default JSON `content-type` for non-binary bodies.
 *
 * @remarks
 * Unlike the v3 (undici) implementation, we do NOT need to manage
 * `accept-encoding` here — `got` advertises the encodings it can decode
 * and decompresses the response body transparently.
 *
 * @internal
 */
function buildHeaders(
  url: URL,
  headers: AptosClientRequest["headers"] | undefined,
  body: unknown,
  jar: CookieJarLike,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value !== undefined) {
      result[key.toLowerCase()] = String(value);
    }
  }

  if (body != null && !(body instanceof Uint8Array) && !("content-type" in result)) {
    result["content-type"] = "application/json";
  }

  applyJarCookies(result, url, jar);

  return result;
}

/**
 * Merge jar cookies into the outgoing `cookie` header.
 * @internal
 */
function applyJarCookies(headers: Record<string, string>, url: URL, jar: CookieJarLike): void {
  const cookies = jar.getCookies(url);
  if (cookies.length === 0) return;
  const jarCookies = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const existing = headers.cookie;
  headers.cookie = existing ? `${existing}; ${jarCookies}` : jarCookies;
}

/**
 * Extract `set-cookie` headers from the response and store them in the jar.
 *
 * `got` returns `set-cookie` as `string[]` (one entry per cookie) on
 * `response.headers["set-cookie"]`. Other headers are plain strings.
 *
 * @internal
 */
function storeResponseCookies(
  url: URL,
  headers: Record<string, string | string[] | undefined>,
  jar: CookieJarLike,
): void {
  const setCookie = headers["set-cookie"];
  if (!setCookie) return;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const cookie of cookies) {
    jar.setCookie(url, cookie);
  }
}

/**
 * Normalize got's header record to the v2-compatible response-headers shape.
 *
 * got already gives us lowercased plain-object headers; we strip undefined
 * entries so downstream callers see only present headers.
 *
 * @internal
 */
function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
