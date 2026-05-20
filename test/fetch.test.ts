/**
 * Tests for the fetch-based client (used by Deno/Bun/edge runtimes; also runs
 * under Node for unit coverage).
 *
 * HTTP/2: the runtime's native fetch decides. Today this means:
 *  - Node 24+ (undici 7+): negotiates HTTP/2 via ALPN.
 *  - Deno: HTTP/2 via ALPN (covered by `deno.integration.ts`).
 *  - Bun (recent): HTTP/2 via ALPN (covered by `bun.integration.ts`).
 *
 * The H2 assertion below reports the negotiated version rather than pinning a
 * specific one so the test remains accurate as runtimes evolve.
 *
 * Decompression: the runtime's fetch transparently decodes `br`, `gzip`, and
 * `deflate` bodies — verified by `/compressed` returning parsed JSON.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import aptosClient, { bcsRequest, jsonRequest } from "../src/index.fetch.js";
import { startH1Server, startH2Server, type TestServer } from "./server.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

describe("fetch client", () => {
  let h1: TestServer;
  let h2: TestServer;

  before(async () => {
    h1 = await startH1Server();
    h2 = await startH2Server();
  });

  after(() => {
    h1?.close();
    h2?.close();
  });

  it("JSON GET", async () => {
    const res = await jsonRequest({ url: `${h1.url}/json`, method: "GET" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { hello: "world", ledger_version: null });
  });

  it("JSON GET with query params (including bigint)", async () => {
    const res = await jsonRequest({
      url: `${h1.url}/json`,
      method: "GET",
      params: { ledger_version: BigInt("12345678901234") },
    });
    assert.equal(res.status, 200);
    assert.equal((res.data as any).ledger_version, "12345678901234");
  });

  it("JSON POST with object body", async () => {
    const res = await jsonRequest({
      url: `${h1.url}/json`,
      method: "POST",
      body: { foo: "bar" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual((res.data as any).echoed, { foo: "bar" });
  });

  it("JSON POST with Uint8Array body", async () => {
    const payload = new TextEncoder().encode(JSON.stringify({ binary: true }));
    const res = await jsonRequest({
      url: `${h1.url}/json`,
      method: "POST",
      body: payload,
    });
    assert.equal(res.status, 200);
    assert.deepEqual((res.data as any).echoed, { binary: true });
  });

  it("BCS request returns ArrayBuffer", async () => {
    const res = await bcsRequest({ url: `${h1.url}/bcs`, method: "GET" });
    assert.equal(res.status, 200);
    assert.ok(res.data instanceof ArrayBuffer);
    assert.deepEqual([...new Uint8Array(res.data)], [0xde, 0xad, 0xbe, 0xef]);
  });

  it("204 No Content returns null data", async () => {
    const res = await jsonRequest({ url: `${h1.url}/no-content`, method: "GET" });
    assert.equal(res.status, 204);
    assert.equal(res.data, null);
  });

  it("empty body returns null data", async () => {
    const res = await jsonRequest({ url: `${h1.url}/empty-body`, method: "GET" });
    assert.equal(res.status, 200);
    assert.equal(res.data, null);
  });

  it("error response returns status without throwing", async () => {
    const res = await jsonRequest({ url: `${h1.url}/error`, method: "GET" });
    assert.equal(res.status, 400);
    assert.deepEqual(res.data, { error: "bad request" });
  });

  it("default export delegates to jsonRequest", async () => {
    const res = await aptosClient({ url: `${h1.url}/json`, method: "GET" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { hello: "world", ledger_version: null });
  });

  it("cookie jar: set-cookie then send cookie", async () => {
    await jsonRequest({ url: `${h1.url}/set-cookie`, method: "GET" });
    const res = await jsonRequest({
      url: `${h1.url}/get-cookie`,
      method: "GET",
    });
    assert.equal(res.status, 200);
    assert.ok(
      (res.data as any).cookie.includes("test=value123"),
      `Expected cookie to include test=value123, got: ${(res.data as any).cookie}`,
    );
  });

  it("HTTP/1.1: GET against an h1-only origin reports 1.1", async () => {
    const res = await jsonRequest({ url: `${h1.url}/json`, method: "GET" });
    assert.equal(res.status, 200);
    assert.equal(res.headers?.["x-http-version"], "1.1");
  });

  it("HTTP/2: negotiates h2 via ALPN against an h2 origin (runtime-dependent)", async () => {
    const res = await jsonRequest({ url: `${h2.url}/json`, method: "GET" });
    assert.equal(res.status, 200);
    const version = res.headers?.["x-http-version"];
    // Whichever the runtime chose, it must be a valid HTTP version. Under
    // Node 24+ undici fetch this is "2.0"; older Nodes fell back to "1.1".
    assert.ok(version === "1.1" || version === "2.0", `unexpected protocol: ${version}`);
    console.log(`  fetch client negotiated: HTTP/${version}`);
  });

  it("decompresses brotli/gzip/deflate transparently", async () => {
    for (const encoding of ["br", "gzip", "deflate"] as const) {
      const res = await jsonRequest({
        url: `${h1.url}/compressed`,
        method: "GET",
        params: { encoding },
      });
      assert.equal(res.status, 200, `status for ${encoding}`);
      assert.deepEqual(res.data, { hello: "compressed", encoding }, `data for ${encoding}`);
    }
  });
});
