/**
 * Response returned by all `aptosClient` entry points.
 *
 * @typeParam Res - The expected shape of the parsed response body.
 *   For {@link jsonRequest} this is the deserialized JSON object;
 *   for {@link bcsRequest} it is `ArrayBuffer`.
 */
export type AptosClientResponse<Res> = {
  /** HTTP status code (e.g. `200`, `404`). */
  status: number;
  /** HTTP reason phrase (e.g. `"OK"`, `"Not Found"`). */
  statusText: string;
  /** Parsed response body. */
  data: Res;
  /** The `RequestInit` (or undici equivalent) that was sent. */
  config?: any;
  /** Metadata about the outgoing request (Node entry point only). */
  request?: any;
  /** The raw `Response` object (Node entry point only). */
  response?: any;
  /** Response headers. */
  headers?: any;
};

/**
 * Options accepted by every `aptosClient` call.
 */
export type AptosClientRequest = {
  /** Fully-qualified URL of the Aptos API endpoint. */
  url: string;
  /** HTTP method — only `GET` and `POST` are supported. */
  method: "GET" | "POST";
  /** Request body. Objects are JSON-serialized; `Uint8Array` is sent as binary. */
  body?: any;
  /** Query-string parameters appended to the URL. `bigint` values are stringified automatically. */
  params?: any;
  /** Additional HTTP headers merged into the request. */
  headers?: any;
  /**
   * Runtime-specific overrides.
   *
   * @remarks
   * In the **browser** entry point, `overrides.WITH_CREDENTIALS` controls the
   * `credentials` option on the `fetch` call (`true` → `"include"`,
   * `false` → `"omit"`).
   */
  overrides?: any;
  /**
   * Enable or disable HTTP/2 negotiation.
   *
   * @defaultValue `true`
   *
   * @remarks
   * Only effective in the **Node** entry point, where it maps to
   * undici's `Agent({ allowH2 })`. In the **fetch**, **browser**, and
   * **React Native** entry points the underlying runtime negotiates
   * HTTP/2 automatically via ALPN — this option is ignored.
   */
  http2?: boolean;
};
