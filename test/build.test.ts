/**
 * Build compatibility tests — verify the package is consumable by different
 * TypeScript compiler settings and bundlers.
 *
 * These tests create a symlink that makes the project root appear as an
 * installed npm package, then run tsc and esbuild against consumer fixture
 * files that import `@aptos-labs/aptos-client`.
 *
 * Prerequisites: the package must be built (`pnpm build`) before running.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "test", "build");
const NODE_MODULES = join(FIXTURE_DIR, "node_modules");
const SYMLINK = join(NODE_MODULES, "@aptos-labs", "aptos-client");
const TSC = join(ROOT, "node_modules", ".bin", "tsc");
const ESBUILD = join(ROOT, "node_modules", ".bin", "esbuild");

function setup() {
  mkdirSync(join(NODE_MODULES, "@aptos-labs"), { recursive: true });
  if (!existsSync(SYMLINK)) {
    symlinkSync(ROOT, SYMLINK, "dir");
  }
}

function cleanup() {
  rmSync(NODE_MODULES, { recursive: true, force: true });
  // Remove any esbuild output
  for (const f of ["out.js", "out.js.map"]) {
    rmSync(join(FIXTURE_DIR, f), { force: true });
  }
}

describe("Build compatibility", () => {
  beforeEach(() => setup());
  afterEach(() => cleanup());

  describe("tsc", () => {
    for (const resolution of ["bundler", "node16", "nodenext"] as const) {
      it(`moduleResolution: ${resolution}`, () => {
        execFileSync(TSC, ["--project", join(FIXTURE_DIR, `tsconfig.${resolution}.json`)], {
          cwd: FIXTURE_DIR,
          stdio: "pipe",
          timeout: 30_000,
        });
      });
    }
  });

  describe("esbuild", () => {
    it("platform: node", () => {
      execFileSync(
        ESBUILD,
        [
          join(FIXTURE_DIR, "consumer.ts"),
          "--bundle",
          "--platform=node",
          "--external:undici",
          `--outfile=${join(FIXTURE_DIR, "out.js")}`,
        ],
        { cwd: ROOT, stdio: "pipe", timeout: 30_000 },
      );
    });

    it("platform: browser", () => {
      execFileSync(
        ESBUILD,
        [
          join(FIXTURE_DIR, "consumer-browser.ts"),
          "--bundle",
          "--platform=browser",
          `--outfile=${join(FIXTURE_DIR, "out.js")}`,
        ],
        { cwd: ROOT, stdio: "pipe", timeout: 30_000 },
      );
    });
  });
});
