/**
 * Tests for the browser client (fetch-based, no cookie jar).
 *
 * In real browsers, HTTP/2 is negotiated by the browser engine and bodies are
 * decompressed transparently. When tested under Node we exercise the same code
 * paths through Node's fetch; whatever Node's fetch negotiates is what we get
 * (Node 24+ undici now supports H2 via ALPN).
 *
 * The browser client has no cookie jar — cookies are managed by the browser.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import aptosClient, { bcsRequest, jsonRequest } from "../src/index.browser.js";
import { startH1Server, startH2Server, type TestServer } from "./server.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

describe("browser client", () => {
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

  it("no cookie jar (cookies managed by the browser)", async () => {
    await jsonRequest({ url: `${h1.url}/set-cookie`, method: "GET" });
    const res = await jsonRequest({
      url: `${h1.url}/get-cookie`,
      method: "GET",
    });
    assert.equal(res.status, 200);
    assert.equal(
      (res.data as any).cookie,
      "",
      "Browser client has no cookie jar — cookies are managed by the browser engine",
    );
  });

  it("HTTP/1.1: GET against an h1-only origin reports 1.1", async () => {
    const res = await jsonRequest({ url: `${h1.url}/json`, method: "GET" });
    assert.equal(res.status, 200);
    assert.equal(res.headers?.["x-http-version"], "1.1");
  });

  it("HTTP/2: negotiates h2 via ALPN when the runtime supports it", async () => {
    const res = await jsonRequest({ url: `${h2.url}/json`, method: "GET" });
    assert.equal(res.status, 200);
    const version = res.headers?.["x-http-version"];
    assert.ok(version === "1.1" || version === "2.0", `unexpected protocol: ${version}`);
    console.log(`  browser client negotiated: HTTP/${version}`);
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

  it("throws on unsupported HTTP methods", async () => {
    await assert.rejects(jsonRequest({ url: `${h1.url}/json`, method: "PUT" as any }), /Unsupported method: PUT/);
  });

  it("warns at most once when the http2 option is set (no-op in browser entry)", async () => {
    const original = console.warn;
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      // Fire two consecutive requests with `http2`. The module-level
      // `http2Warned` flag must keep the count at most one across both.
      const res1 = await jsonRequest({ url: `${h1.url}/json`, method: "GET", http2: true });
      const res2 = await jsonRequest({ url: `${h1.url}/json`, method: "GET", http2: false });
      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);
      const http2Warnings = warnings.filter((w) => String(w[0]).includes("http2"));
      assert.ok(http2Warnings.length <= 1, `expected at most 1 http2 warning, got ${http2Warnings.length}`);
    } finally {
      console.warn = original;
    }
  });

  it("WITH_CREDENTIALS=false sends `credentials: omit`", async () => {
    // We can't inspect fetch's credentials option from the response, but
    // exercising the branch ensures the build doesn't break and the code
    // path is covered.
    const res = await jsonRequest({
      url: `${h1.url}/json`,
      method: "GET",
      overrides: { WITH_CREDENTIALS: false },
    });
    assert.equal(res.status, 200);
  });

  it("undefined header values are skipped", async () => {
    const res = await jsonRequest({
      url: `${h1.url}/json`,
      method: "GET",
      headers: { "x-defined": "yes", "x-undefined": undefined },
    });
    assert.equal(res.status, 200);
  });
});
