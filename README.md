![License][github-license]
[![NPM Package Version][npm-image-version]][npm-url]
![Node Version](https://img.shields.io/node/v/%40aptos-labs%2Faptos-client)
![NPM bundle size](https://img.shields.io/bundlephobia/min/%40aptos-labs/aptos-client)
[![NPM Package Downloads][npm-image-downloads]][npm-url]

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

`undici` is an optional peer dependency — only needed in Node.js:

```bash
npm install undici
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
| `node` | `index.node.ts` | Configurable via `http2` option (default `true`) | Uses [undici](https://undici.nodejs.org) `Agent({ allowH2 })` |
| `browser` | `index.browser.ts` | Automatic (browser engine) | Delegates cookies to the browser |
| `react-native` | `index.fetch.ts` | Automatic (OkHttp / NSURLSession) | Platform negotiates HTTP/2 via ALPN |
| `deno` | `index.fetch.ts` | Automatic | — |
| `bun` | `index.fetch.ts` | Automatic | — |
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
  headers?: any;
};
```

> See [`src/types.ts`](./src/types.ts) for the full type definitions with documentation.

## HTTP/2

| Runtime | How it works |
|---|---|
| **Node.js** | undici negotiates HTTP/2 via ALPN when `http2: true` (the default). Set `http2: false` to force HTTP/1.1. |
| **Browser** | The browser engine negotiates HTTP/2 with the server automatically. The `http2` option is ignored. |
| **React Native** | OkHttp (Android) and NSURLSession (iOS) negotiate HTTP/2 via ALPN automatically. The `http2` option is ignored. |
| **Deno / Bun** | The runtime negotiates HTTP/2 automatically. The `http2` option is ignored. |

#### Releasing a new version

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
