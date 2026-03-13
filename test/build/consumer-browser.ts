/**
 * Consumer fixture — simulates a browser project importing this package.
 * The browser entry point does NOT export CookieJar/CookieJarLike.
 * Used by the esbuild browser platform test.
 */
import aptosClient, { bcsRequest, jsonRequest } from "@aptos-labs/aptos-client";

async function _verify() {
  const res = await aptosClient<{ chain_id: number }>({
    url: "https://fullnode.mainnet.aptoslabs.com/v1",
    method: "GET",
    overrides: { WITH_CREDENTIALS: true },
  });
  const _status: number = res.status;
  const _data: { chain_id: number } = res.data;

  await jsonRequest<string[]>({ url: "https://example.com", method: "GET" });
  await bcsRequest({ url: "https://example.com", method: "POST", body: {} });
}
