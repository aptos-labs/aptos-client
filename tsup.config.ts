import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "index.node": "src/index.node.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    outDir: "dist/node",
    platform: "node",
  },
  {
    entry: { "index.browser": "src/index.browser.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    outDir: "dist/browser",
  },
  {
    entry: { "index.fetch": "src/index.fetch.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    outDir: "dist/fetch",
  },
]);
