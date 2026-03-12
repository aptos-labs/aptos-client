/**
 * Tests for the browser client (fetch-based, no cookie jar).
 * HTTP/2: In real browsers, HTTP/2 is negotiated automatically by the browser engine.
 * When tested under Node, HTTP/2 is NOT available (same undici limitation as fetch client).
 * The browser client has no cookie jar — cookies are managed by the browser itself.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import aptosClient, { bcsRequest, jsonRequest } from "../src/index.browser.ts";
import { startH1Server, startH2Server, type TestServer } from "./server.ts";

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

  it("HTTP/2: falls back to HTTP/1.1 under Node (browser would negotiate h2 natively)", async () => {
    const res = await jsonRequest({
      url: `${h2.url}/json`,
      method: "GET",
    });
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("x-http-version"),
      "1.1",
      "Under Node, browser client falls back to 1.1. In a real browser, h2 is negotiated by the engine.",
    );
  });
});
