/**
 * Deno integration test — verifies the fetch-based client works under Deno
 * and that HTTP/2 is negotiated automatically via ALPN.
 *
 * Run: deno test --allow-all test/deno.integration.ts
 *
 * The h2 server runs as a Node subprocess (Deno doesn't implement http2.createSecureServer).
 */
import { assert, assertEquals } from "jsr:@std/assert";

// Import the built fetch client
const { default: _aptosClient, jsonRequest, bcsRequest } = await import("../dist/fetch/index.fetch.mjs");

let h1Url: string;
let h2Url: string;
let serverProcess: Deno.ChildProcess;

async function startServers() {
  // Start the test servers via Node (server.ts has a CLI mode)
  const cmd = new Deno.Command("npx", {
    args: ["tsx", "test/server.ts"],
    stdout: "piped",
    stderr: "null",
    env: { ...Deno.env.toObject(), NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  });
  serverProcess = cmd.spawn();

  // Read the first line of stdout which contains the JSON with URLs
  const reader = serverProcess.stdout.getReader();
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
}

function stopServers() {
  try {
    serverProcess?.kill("SIGTERM");
  } catch {
    // Already exited
  }
}

Deno.test({
  name: "deno integration — setup servers",
  fn: async () => {
    await startServers();
    assert(h1Url, "h1 URL should be set");
    assert(h2Url, "h2 URL should be set");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "deno — JSON GET",
  fn: async () => {
    const res = await jsonRequest({ url: `${h1Url}/json`, method: "GET" });
    assertEquals(res.status, 200);
    assertEquals(res.data, { hello: "world", ledger_version: null });
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "deno — JSON POST with body",
  fn: async () => {
    const res = await jsonRequest({
      url: `${h1Url}/json`,
      method: "POST",
      body: { foo: "bar" },
    });
    assertEquals(res.status, 200);
    assertEquals(res.data.echoed, { foo: "bar" });
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "deno — BCS returns ArrayBuffer",
  fn: async () => {
    const res = await bcsRequest({ url: `${h1Url}/bcs`, method: "GET" });
    assertEquals(res.status, 200);
    assert(res.data instanceof ArrayBuffer);
    assertEquals([...new Uint8Array(res.data)], [0xde, 0xad, 0xbe, 0xef]);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "deno — cookie jar works",
  fn: async () => {
    await jsonRequest({ url: `${h1Url}/set-cookie`, method: "GET" });
    const res = await jsonRequest({
      url: `${h1Url}/get-cookie`,
      method: "GET",
    });
    assertEquals(res.status, 200);
    assert(res.data.cookie.includes("test=value123"), `Expected cookie, got: ${res.data.cookie}`);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "deno — HTTP/2 is negotiated automatically via ALPN",
  fn: async () => {
    const res = await jsonRequest({
      url: `${h2Url}/json`,
      method: "GET",
    });
    assertEquals(res.status, 200);
    const version = res.headers.get("x-http-version");
    console.log(`  Deno negotiated HTTP version: ${version}`);
    assertEquals(version, "2.0", "Deno's native fetch should negotiate HTTP/2 via ALPN");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "deno integration — teardown servers",
  fn: () => {
    stopServers();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
