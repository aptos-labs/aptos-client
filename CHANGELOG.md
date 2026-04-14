# Aptos Client Changelog

All notable changes to the Aptos client will be captured in this file. This changelog is written by hand for now. It
adheres to the format set out by [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

# Unreleased

# 4.0.0

### Breaking Changes

- **ESM-only** — CJS `require()` is no longer supported. Consumers must use `import`.
- **TypeScript 6.0** — Upgraded from TypeScript 5.x to 6.0.2.

### Changed

- **NodeNext module resolution** — Source uses `module: "nodenext"` with explicit `.js` extensions on all relative imports. The published package is fully compatible with `bundler`, `node16`, and `nodenext` consumers.
- **Build with `tsc` instead of `tsup`** — Plain `tsc` compiles directly to a flat `dist/` directory. No bundler needed.
- **`undici` is now a regular dependency** — Previously an optional peer dependency. The Node.js entry point always imports it, so making it a regular dependency prevents confusing `ERR_MODULE_NOT_FOUND` errors. Browser, Deno, Bun, and React Native entry points never load it.
- **Flat `dist/` layout** — Output files moved from `dist/node/`, `dist/browser/`, `dist/fetch/` to a single `dist/` directory.
- **Added `workerd` and `edge-light` export conditions** — Cloudflare Workers and Vercel Edge Functions now resolve to the fetch-based entry point automatically.
- **Removed legacy `main`, `browser`, and `react-native` top-level fields** — The `exports` map is the sole entry point resolution mechanism. Only `types` is kept as a TypeScript fallback.

### Removed

- **CJS output** — No more `.cjs` or dual `.mjs`/`.js` outputs. All output is ESM `.js`.
- **`tsup` dependency** — Replaced by plain `tsc`. Removes 78 transitive dependencies.
- **`node16` build test** — Superseded by the `nodenext` consumer test.
- **Unused `picomatch` and `brace-expansion` devDependencies.**

### Fixed

- Fixes the breaking change between 2.x and 3.x around headers. This is a breaking change from 3.0.0 and 3.0.1, but no downstream dependencies were using it.

# 3.0.1

### Added

- **Build compatibility tests** — New `test:build` script verifies the package is consumable by downstream projects using `tsc` (with `moduleResolution` set to `bundler`, `node16`, and `nodenext`) and `esbuild` (targeting both `node` and `browser` platforms).

### Changed

- **`undici` dependency range** — Updated the `undici` peer and dev dependency ranges to reflect the versions validated by this release.

# 3.0.0

### Breaking Changes

- **Replaced `got` with `undici`** — The Node.js entry point now uses [undici](https://undici.nodejs.org) instead of `got` for HTTP requests. `undici` is declared as an optional peer dependency (`^7.22.0`) and is only required in Node.js environments.
- **New multi-entry-point architecture** — The package now ships three distinct entry points selected via [conditional exports](https://nodejs.org/api/packages.html#conditional-exports):
  - `index.node.ts` — Node.js (undici with configurable HTTP/2)
  - `index.fetch.ts` — Deno, Bun, React Native, and other fetch-based runtimes
  - `index.browser.ts` — Browsers (with `credentials` support)
- **Minimum Node.js version raised to 22.**

### Added

- **HTTP/2 by default** — The Node.js client enables HTTP/2 via undici's `Agent({ allowH2: true })`. Controlled by the `http2` option on `AptosClientRequest` (default `true`).
- **`react-native` export condition** — React Native is now an explicit export target. It resolves to `index.fetch.ts`; HTTP/2 is negotiated automatically by the platform (OkHttp on Android, NSURLSession on iOS).
- **Cookie jar** — Built-in `CookieJar` for Node.js and fetch entry points. Browsers delegate cookie handling to the browser engine.
- **`bcsRequest()` named export** — For binary (BCS) responses returning `ArrayBuffer`.
- **TSDoc documentation** — All public APIs and types now have TSDoc comments.

### Fixed

- Fixed `Uint8Array` type error in the browser build (#16).

### Build comparison (v2.2.0 → v3.0.0)

**Bundle size (JS output only):**

| Entry point     | v2.2.0    | v3.0.0     | Change                                             |
|-----------------|-----------|------------|----------------------------------------------------|
| Node CJS        | 7.04 KB   | 6.91 KB    | −0.13 KB                                           |
| Node ESM        | 5.35 KB   | 5.85 KB    | +0.50 KB                                           |
| Browser CJS     | 2.81 KB   | 2.82 KB    | +0.01 KB                                           |
| Browser ESM     | 1.76 KB   | 1.77 KB    | +0.01 KB                                           |
| Fetch CJS       | —         | 5.58 KB    | new                                                |
| Fetch ESM       | —         | 4.52 KB    | new                                                |
| **Total dist/** | **64 KB** | **104 KB** | +40 KB (includes new fetch entry + expanded .d.ts) |

**Dependencies:**

|                   | v2.2.0 (`got`)                  | v3.0.0 (`undici`)            |
|-------------------|---------------------------------|------------------------------|
| Production deps   | ~47 packages (got + transitive) | 1 package (undici, optional) |
| Non-Node runtimes | N/A (browser entry had no deps) | 0 packages                   |

**Build time:**

|              | v2.2.0             | v3.0.0                           |
|--------------|--------------------|----------------------------------|
| Wall time    | ~3.8s (sequential) | ~2.5s (parallel via tsup config) |
| Entry points | 2 (node, browser)  | 3 (node, browser, fetch)         |

# Released

# 2.2.0

- Replace ESLint and Prettier with Biome for linting and formatting
- Replace `ts-node` with `tsx`
- Update devDependencies to latest versions (`typescript`, `tsup`, `@types/node`, `semver`)
- Use `import type` for type-only imports
- Bump TypeScript target from `es2020` to `es2022`

# 2.1.0

- Make `http2` optional. Default to true

# 2.0.0

- Remove `axios` from browser implementation in favor of native `fetch`
- Remove support for Node.js versions earlier than 20.x.x
- Upgraded pnpm version to 10.10.0

# 1.2.0

- Bump `axios` to >=1.8.4
- Upgrade dev dependencies
- Format code

# 1.1.0

- Bump `axios` to 1.8.0

# 1.0.0

- Add experimental support for binary client calls

# 0.2.0

- Update dependencies to latest versions, move them to peer dependencies

# 0.1.1

- Update axios to 1.7.4 due to issue on https://github.com/advisories/GHSA-8hc4-vh64-cxmj

# 0.1.0

- Update to Axios v1.6.2, and other dev dependencies
