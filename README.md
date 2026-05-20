![License][github-license]
[![NPM Package Version][npm-image-version]][npm-url]
![Node Version](https://img.shields.io/node/v/%40aptos-labs%2Faptos-client)
![NPM bundle size](https://img.shields.io/bundlephobia/min/%40aptos-labs/aptos-client)
[![NPM Package Downloads][npm-image-downloads]][npm-url]
[![codecov](https://codecov.io/gh/aptos-labs/aptos-client/branch/main/graph/badge.svg)](https://codecov.io/gh/aptos-labs/aptos-client)

# @aptos-labs/aptos-client

HTTP client for the Aptos network API. Works standalone or as the transport layer for the [Aptos TypeScript SDK](https://github.com/aptos-labs/aptos-ts-sdk).

## Features

- **HTTP/2** — enabled by default on all platforms
- **Multi-runtime** — Node.js, Deno, Bun, browsers, and React Native
- **Cookie jar** — automatic cookie handling in Node, Deno, and Bun
- **BCS support** — `bcsRequest()` returns raw `ArrayBuffer` for binary-encoded responses

## Installation

```bash
npm install @aptos-labs/aptos-client
# or
pnpm add @aptos-labs/aptos-client
```

## Usage

```ts
import aptosClient from "@aptos-labs/aptos-client";

const { status, data } = await aptosClient<{ chain_id: number }>({
  url: "https://fullnode.mainnet.aptoslabs.com/v1",
  method: "GET",
});
```

### Named exports

```ts
import { jsonRequest, bcsRequest } from "@aptos-labs/aptos-client";

// JSON (same as default export)
const json = await jsonRequest<MyType>({ url, method: "GET" });

// BCS (returns ArrayBuffer)
const bcs = await bcsRequest({ url, method: "GET" });
```

## Runtime Resolution

The package uses [conditional exports](https://nodejs.org/api/packages.html#conditional-exports) to select the right implementation for each runtime:

| Condition | Entry point | HTTP/2 | Notes |
|---|---|---|---|
| `node` | `index.node.ts` | Configurable via `http2` option (default `true`) | Uses [got](https://github.com/sindresorhus/got) (decodes `br`/`gzip`/`deflate` transparently on H1 and H2) |
| `browser` | `index.browser.ts` | Automatic (browser engine) | Delegates cookies to the browser |
| `react-native` | `index.fetch.ts` | Automatic (OkHttp / NSURLSession) | Platform negotiates HTTP/2 via ALPN |
| `deno` | `index.fetch.ts` | Automatic | — |
| `bun` | `index.fetch.ts` | Automatic | — |
| `workerd` | `index.fetch.ts` | Automatic | Cloudflare Workers |
| `edge-light` | `index.fetch.ts` | Automatic | Vercel Edge Functions |
| `default` | `index.fetch.ts` | Depends on runtime | Fallback for unknown runtimes |

## Types

```ts
type AptosClientRequest = {
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  params?: Record<string, string | number | bigint | boolean | undefined>;
  headers?: Record<string, string | undefined>;
  overrides?: { WITH_CREDENTIALS?: boolean };
  http2?: boolean;    // Node only — ignored elsewhere
  cookieJar?: CookieJarLike; // Per-request cookie isolation (Node & fetch only)
};

type AptosClientResponse<Res> = {
  status: number;
  statusText: string;
  data: Res;
  config?: any;
  request?: any;
  response?: any;
  headers?: Record<string, string | string[]>;
};
```

> See [`src/types.ts`](./src/types.ts) for the full type definitions with documentation.

## HTTP/2

| Runtime | How it works |
|---|---|
| **Node.js** | `got` negotiates HTTP/2 via ALPN (powered by `http2-wrapper`) when `http2: true` (the default). Set `http2: false` to force HTTP/1.1. |
| **Browser** | The browser engine negotiates HTTP/2 with the server automatically. The `http2` option is ignored. |
| **React Native** | OkHttp (Android) and NSURLSession (iOS) negotiate HTTP/2 via ALPN automatically. The `http2` option is ignored. |
| **Deno / Bun** | The runtime negotiates HTTP/2 automatically. The `http2` option is ignored. |

## Migrating from v2

v4.1.0 returns to the same HTTP library v2 used (`got`) while keeping the v4 architecture (ESM, conditional exports, multi-runtime). For most callers the migration is one or two small edits.

> **If you are on v3.0.0 through v4.0.0, upgrade.** Those versions silently return raw compressed bytes instead of parsed JSON whenever the origin sends `content-encoding: br`/`gzip`/`deflate` — which is what the Aptos fullnode and indexer do. 4.1.0 restores v2-era decompression behavior.

### What works the same as v2

- `http2: true` default; falls back to H1.1 when the server doesn't support H2.
- Brotli / gzip / deflate decompression handled transparently.
- Cookie jar round-trips `set-cookie` and re-sends cookies on same-origin requests.
- `bigint` query params are stringified.
- 4xx / 5xx responses do **not** throw — inspect `res.status`.
- `AptosClientResponse` shape: `{ status, statusText, data, config, request, response, headers }` with `headers` as a plain `Record<string, string | string[]>`.

### Behavior changes (observable to callers)

| Change | v2 | v4.1.0 |
|---|---|---|
| **BCS response type** | `Buffer` | `ArrayBuffer` — cross-runtime, no `Buffer` polyfill needed. The bytes are identical; use `new Uint8Array(res.data)` or `Buffer.from(res.data)` if you need either shape. |
| **Retries** | got default (`limit: 2`, backoff) | **Off** (`limit: 0`). Wrap in your own retry loop, or let the Aptos TS SDK manage retries at a higher layer. |
| **Non-JSON bodies** | `JSON.parse` would throw | Falls back to returning the raw text in `data` — lets callers inspect the status code regardless of body content-type. |
| **Empty / 204 / 205 bodies** | Whatever got returned (often `""` or `undefined`) | Explicitly `null`. |
| **`statusText` over HTTP/2** | Empty string (H2 has no reason phrase) | Falls back to `http.STATUS_CODES[code]` — `"OK"`, `"Not Found"`, etc. |
| **`NODE_TLS_REJECT_UNAUTHORIZED=0` on H2** | Inherited transitively (worked by accident) | Explicitly propagated to got's `https.rejectUnauthorized` — works on both H1 and H2. |

### New capabilities since v2

- **Per-request cookie jar isolation** — pass `cookieJar: new CookieJar()` to keep multi-tenant requests from sharing cookie state.
- **Public `CookieJar`** is now exported (with RFC 6265 validation, expiry eviction, per-origin caps, and SameSite=None+Secure enforcement).
- **`CookieJarLike` interface** — bring your own jar (e.g. tough-cookie or a database-backed store).
- **Conditional exports** auto-select the right entry for Node / browser / Deno / Bun / Cloudflare Workers / Vercel Edge / React Native. v2 only shipped Node + browser.
- **`overrides.WITH_CREDENTIALS`** (browser entry) maps to `fetch`'s `credentials: "omit" | "include"`.

### Removed since v2

- **CJS `require()`** — the package is ESM-only since v4.0. Use `import` or `await import(...)`.
- **Re-export of got error types** — if you handled `RequestError` / `HTTPError` directly, import them from `got` (it's still a direct dependency).
- **Node < 22** — the minimum supported Node version is 22.

### Migration checklist

1. **Using `require()`?** → switch to `import` (or `await import()` from CJS).
2. **Calling `Buffer` methods on a BCS response?** → use `new Uint8Array(res.data)`, `new DataView(res.data)`, or wrap with `Buffer.from(res.data)`.
3. **Relying on automatic retries?** → add an explicit retry wrapper. (Most consumers — including the Aptos TS SDK — don't need to.)
4. **Node version < 22?** → upgrade.

That's the full migration. Everything else either works the same, is additive, or is a fixed bug.

## Releasing a new version

Releases are published to npm automatically via GitHub Actions whenever a GitHub release is created. The workflow lives in `.github/workflows/publish.yml`.

To release a new version:

1. **Update the version** in `package.json` (follows [semver](https://semver.org/)):

   ```bash
   npm version <major|minor|patch> --no-git-tag-version
   ```

2. **Update `CHANGELOG.md`** — move any notes under `# Unreleased` into a new section for the version being released.

3. **Commit and push** the version bump and changelog update to `main`:

   ```bash
   git add package.json CHANGELOG.md
   git commit -m "v<VERSION>"
   git push
   ```

4. **Create a GitHub release** with a tag that matches `vMAJOR.MINOR.PATCH` (e.g. `v2.3.0`). The tag **must** match the version in `package.json` — the publish workflow will fail otherwise. Pre-release tags like `v2.3.0-beta.1` are also supported.

The publish workflow will then automatically:

- Validate that the tag matches the expected `vMAJOR.MINOR.PATCH[-prerelease]` pattern.
- Verify that the tag matches the `version` field in `package.json`.
- Install dependencies, build the package, and publish to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements).

[npm-image-version]: https://img.shields.io/npm/v/%40aptos-labs%2Faptos-client.svg
[npm-image-downloads]: https://img.shields.io/npm/dm/%40aptos-labs%2Faptos-client.svg
[npm-url]: https://npmjs.org/package/@aptos-labs/aptos-client
[github-license]: https://img.shields.io/github/license/aptos-labs/aptos-client
