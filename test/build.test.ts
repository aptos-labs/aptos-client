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
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, symlinkSync } from "node:fs";
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
    for (const resolution of ["bundler", "nodenext"] as const) {
      it(`moduleResolution: ${resolution}`, () => {
        // tsc exits non-zero on type errors; execFileSync throws on that.
        const stdout = execFileSync(TSC, ["--project", join(FIXTURE_DIR, `tsconfig.${resolution}.json`)], {
          cwd: FIXTURE_DIR,
          stdio: "pipe",
          timeout: 30_000,
        });
        // tsc on success produces empty stdout; any output here indicates a warning
        // that should be surfaced rather than silently swallowed.
        assert.equal(stdout.toString().trim(), "", `tsc produced unexpected output: ${stdout}`);
        // Verify the package's declaration files were actually consumed.
        const distTypes = join(ROOT, "dist", "index.node.d.ts");
        assert.ok(existsSync(distTypes), `expected ${distTypes} to exist (run pnpm build first)`);
      });
    }
  });

  describe("esbuild", () => {
    const outFile = join(FIXTURE_DIR, "out.js");

    it("platform: node", () => {
      execFileSync(
        ESBUILD,
        [join(FIXTURE_DIR, "consumer.ts"), "--bundle", "--platform=node", "--external:got", `--outfile=${outFile}`],
        { cwd: ROOT, stdio: "pipe", timeout: 30_000 },
      );
      assert.ok(existsSync(outFile), "esbuild should have produced out.js");
      assert.ok(statSync(outFile).size > 0, "out.js should not be empty");
    });

    it("platform: browser", () => {
      execFileSync(
        ESBUILD,
        [join(FIXTURE_DIR, "consumer-browser.ts"), "--bundle", "--platform=browser", `--outfile=${outFile}`],
        { cwd: ROOT, stdio: "pipe", timeout: 30_000 },
      );
      assert.ok(existsSync(outFile), "esbuild should have produced out.js");
      assert.ok(statSync(outFile).size > 0, "out.js should not be empty");
    });
  });
});
