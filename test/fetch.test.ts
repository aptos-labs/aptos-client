/**
 * Tests for the fetch-based client (designed for Deno/Bun).
 * When run under Node, HTTP/2 is NOT available (Node's fetch/undici doesn't support h2).
 * When run under Deno or Bun, HTTP/2 is negotiated automatically via ALPN.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import aptosClient, { bcsRequest, jsonRequest } from "../src/index.fetch.ts";
import { startH1Server, startH2Server, type TestServer } from "./server.ts";

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

  it("HTTP/2: Node's fetch (undici) falls back to HTTP/1.1", async () => {
    const res = await jsonRequest({
      url: `${h2.url}/json`,
      method: "GET",
    });
    assert.equal(res.status, 200);
    // Node's undici-based fetch cannot negotiate HTTP/2 — always falls back to 1.1
    assert.equal(
      res.headers.get("x-http-version"),
      "1.1",
      "Under Node, fetch does NOT support HTTP/2. Deno and Bun negotiate h2 automatically.",
    );
  });
});
