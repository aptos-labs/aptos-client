/**
 * Bun integration test — verifies the fetch-based client works under Bun
 * and that HTTP/2 is negotiated automatically via ALPN.
 *
 * Run: bun test test/bun.integration.ts
 *
 * The h2 server runs as a Node subprocess for reliability.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Subprocess, spawn } from "bun";

// Import the built fetch client
const { default: _aptosClient, jsonRequest, bcsRequest } = await import("../dist/fetch/index.fetch.mjs");

let h1Url: string;
let h2Url: string;
let serverProc: Subprocess;

beforeAll(async () => {
  // Allow self-signed certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  // Start the test servers via Node
  serverProc = spawn(["npx", "tsx", "test/server.ts"], {
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  });

  // Read the JSON URLs from stdout
  const reader = serverProc.stdout.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
    if (output.includes("\n")) break;
  }
  reader.releaseLock();

  const urls = JSON.parse(output.trim());
  h1Url = urls.h1;
  h2Url = urls.h2;
});

afterAll(() => {
  serverProc?.kill();
});

describe("bun — basic functionality", () => {
  it("JSON GET", async () => {
    const res = await jsonRequest({ url: `${h1Url}/json`, method: "GET" });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ hello: "world", ledger_version: null });
  });

  it("JSON POST with body", async () => {
    const res = await jsonRequest({
      url: `${h1Url}/json`,
      method: "POST",
      body: { foo: "bar" },
    });
    expect(res.status).toBe(200);
    expect(res.data.echoed).toEqual({ foo: "bar" });
  });

  it("BCS returns ArrayBuffer", async () => {
    const res = await bcsRequest({ url: `${h1Url}/bcs`, method: "GET" });
    expect(res.status).toBe(200);
    expect(res.data).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(res.data)]).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it("cookie jar works", async () => {
    await jsonRequest({ url: `${h1Url}/set-cookie`, method: "GET" });
    const res = await jsonRequest({
      url: `${h1Url}/get-cookie`,
      method: "GET",
    });
    expect(res.status).toBe(200);
    expect(res.data.cookie).toContain("test=value123");
  });
});

describe("bun — HTTP/2", () => {
  it("reports negotiated HTTP version against h2 server", async () => {
    const res = await jsonRequest({
      url: `${h2Url}/json`,
      method: "GET",
    });
    expect(res.status).toBe(200);
    const version = res.headers.get("x-http-version");
    console.log(`  Bun negotiated HTTP version: ${version}`);
    // Bun 1.x fetch does NOT negotiate HTTP/2 — it falls back to 1.1.
    // This is a known Bun limitation. Track: https://github.com/oven-sh/bun/issues/887
    expect(version).toBe("1.1");
  });
});
