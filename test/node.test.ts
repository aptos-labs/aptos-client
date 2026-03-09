/**
 * Tests for the Node.js client (undici-based).
 * HTTP/2: SUPPORTED — undici Agent with allowH2: true negotiates h2 via ALPN.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import aptosClient, { bcsRequest, jsonRequest } from "../src/index.node.ts";
import { startH1Server, startH2Server, type TestServer } from "./server.ts";

// Allow self-signed certs for h2 tests
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

describe("node client (undici)", () => {
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

  it("BCS request returns binary data", async () => {
    const res = await bcsRequest({ url: `${h1.url}/bcs`, method: "GET" });
    assert.equal(res.status, 200);
    // undici returns ArrayBuffer from res.arrayBuffer()
    assert.ok(res.data instanceof ArrayBuffer, "bcsRequest should return ArrayBuffer");
    const bytes = new Uint8Array(res.data as ArrayBuffer);
    assert.deepEqual([...bytes], [0xde, 0xad, 0xbe, 0xef]);
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
    const cookie = (res.data as any).cookie;
    assert.ok(cookie.includes("test=value123"), `Expected cookie header to include test=value123, got: ${cookie}`);
  });

  it("HTTP/2: negotiates h2 when http2: true (default)", async () => {
    const res = await jsonRequest({
      url: `${h2.url}/json`,
      method: "GET",
      http2: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-http-version"), "2.0", "undici with allowH2 should negotiate HTTP/2 via ALPN");
  });

  it("HTTP/2: falls back to HTTP/1.1 when http2: false", async () => {
    const res = await jsonRequest({
      url: `${h2.url}/json`,
      method: "GET",
      http2: false,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-http-version"), "1.1");
  });

  it("HTTP/2: BCS over h2", async () => {
    const res = await bcsRequest({
      url: `${h2.url}/bcs`,
      method: "GET",
      http2: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-http-version"), "2.0");
    const bytes = new Uint8Array(res.data as ArrayBuffer);
    assert.deepEqual([...bytes], [0xde, 0xad, 0xbe, 0xef]);
  });
});
