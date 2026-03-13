/**
 * Consumer fixture — simulates an ESM Node.js project importing this package.
 * Used by the build compatibility tests (tsc with various moduleResolution settings, esbuild node).
 */
import type { CookieJarLike } from "@aptos-labs/aptos-client";
import aptosClient, { bcsRequest, CookieJar, jsonRequest } from "@aptos-labs/aptos-client";

async function _verify() {
  // Default export: generic JSON request
  const res = await aptosClient<{ chain_id: number }>({
    url: "https://fullnode.mainnet.aptoslabs.com/v1",
    method: "GET",
    params: { limit: 10, start: BigInt(0) },
    headers: { "x-custom": "value" },
    http2: true,
  });
  const _status: number = res.status;
  const _statusText: string = res.statusText;
  const _data: { chain_id: number } = res.data;

  // Named JSON request
  await jsonRequest<string[]>({ url: "https://example.com", method: "GET" });

  // BCS request returns ArrayBuffer
  const bcsRes = await bcsRequest({ url: "https://example.com", method: "POST", body: new Uint8Array([1, 2, 3]) });
  const _bcsData: ArrayBuffer = bcsRes.data;

  // CookieJar satisfies CookieJarLike
  const jar: CookieJarLike = new CookieJar();
  jar.setCookie(new URL("https://example.com"), "session=abc");
  const cookies = jar.getCookies(new URL("https://example.com"));
  const _name: string = cookies[0].name;
  const _value: string = cookies[0].value;

  // Per-request cookie jar
  await aptosClient({ url: "https://example.com", method: "GET", cookieJar: jar });
}
