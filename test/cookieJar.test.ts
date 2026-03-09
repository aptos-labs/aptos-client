/**
 * Unit tests for CookieJar security paths and edge cases.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookieJar } from "../src/cookieJar.ts";

const url = new URL("https://example.com");
const httpUrl = new URL("http://example.com");

describe("CookieJar.parse", () => {
  it("parses a basic cookie", () => {
    const cookie = CookieJar.parse("foo=bar");
    assert.equal(cookie.name, "foo");
    assert.equal(cookie.value, "bar");
  });

  it("parses cookie with attributes", () => {
    const cookie = CookieJar.parse("foo=bar; Secure; HttpOnly; SameSite=Strict");
    assert.equal(cookie.name, "foo");
    assert.equal(cookie.value, "bar");
    assert.equal(cookie.secure, true);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "Strict");
  });

  it("parses empty cookie value", () => {
    const cookie = CookieJar.parse("foo=");
    assert.equal(cookie.name, "foo");
    assert.equal(cookie.value, "");
  });

  it("parses cookie value containing =", () => {
    const cookie = CookieJar.parse("foo=bar=baz");
    assert.equal(cookie.name, "foo");
    assert.equal(cookie.value, "bar=baz");
  });

  it("parses Expires attribute", () => {
    const cookie = CookieJar.parse("foo=bar; Expires=Wed, 09 Jun 2100 10:18:14 GMT");
    assert.ok(cookie.expires instanceof Date);
    assert.ok(cookie.expires.getTime() > Date.now());
  });

  it("strips matching quotes from attribute values", () => {
    const cookie = CookieJar.parse('foo=bar; SameSite="Lax"');
    assert.equal(cookie.sameSite, "Lax");
  });

  it("rejects cookie with no name (= at position 0)", () => {
    assert.throws(() => CookieJar.parse("=bar"), /Invalid cookie/);
  });

  it("rejects cookie with no = sign", () => {
    assert.throws(() => CookieJar.parse("foobar"), /Invalid cookie/);
  });

  it("rejects empty string", () => {
    assert.throws(() => CookieJar.parse(""), /Invalid cookie/);
  });
});

describe("CookieJar — CTL character rejection (RFC 6265)", () => {
  it("rejects NUL (0x00) in cookie name", () => {
    assert.throws(() => CookieJar.parse("fo\x00o=bar"), /control characters/);
  });

  it("rejects NUL (0x00) in cookie value", () => {
    assert.throws(() => CookieJar.parse("foo=ba\x00r"), /control characters/);
  });

  it("rejects CR (0x0D) in cookie name", () => {
    assert.throws(() => CookieJar.parse("fo\ro=bar"), /control characters/);
  });

  it("rejects LF (0x0A) in cookie value", () => {
    assert.throws(() => CookieJar.parse("foo=ba\nr"), /control characters/);
  });

  it("rejects TAB (0x09) in cookie name", () => {
    assert.throws(() => CookieJar.parse("fo\to=bar"), /control characters/);
  });

  it("rejects DEL (0x7F) in cookie name", () => {
    assert.throws(() => CookieJar.parse("fo\x7Fo=bar"), /control characters/);
  });

  it("rejects BEL (0x07) in cookie value", () => {
    assert.throws(() => CookieJar.parse("foo=ba\x07r"), /control characters/);
  });

  it("setCookie silently skips cookies with control characters", () => {
    const jar = new CookieJar();
    jar.setCookie(url, "fo\x00o=bar");
    assert.deepEqual(jar.getCookies(url), []);
  });
});

describe("CookieJar — SameSite=None without Secure", () => {
  it("rejects SameSite=None without Secure attribute", () => {
    const jar = new CookieJar();
    jar.setCookie(url, "foo=bar; SameSite=None");
    assert.deepEqual(jar.getCookies(url), []);
  });

  it("accepts SameSite=None with Secure attribute", () => {
    const jar = new CookieJar();
    jar.setCookie(url, "foo=bar; SameSite=None; Secure");
    const cookies = jar.getCookies(url);
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].name, "foo");
  });
});

describe("CookieJar — Secure cookie filtering", () => {
  it("returns Secure cookies over HTTPS", () => {
    const jar = new CookieJar();
    jar.setCookie(url, "foo=bar; Secure");
    assert.equal(jar.getCookies(url).length, 1);
  });

  it("excludes Secure cookies over HTTP", () => {
    const jar = new CookieJar();
    jar.setCookie(url, "foo=bar; Secure");
    assert.equal(jar.getCookies(httpUrl).length, 0);
  });
});

describe("CookieJar — expiry eviction", () => {
  it("filters out expired cookies from getCookies", () => {
    const jar = new CookieJar();
    jar.setCookie(url, "foo=bar; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    assert.deepEqual(jar.getCookies(url), []);
  });

  it("evicts expired cookies from storage on getCookies", () => {
    const jar = new CookieJar();
    // Set a cookie that expires in the past
    jar.setCookie(url, "old=stale; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    // Set a cookie that is still valid
    jar.setCookie(url, "fresh=good");
    // getCookies should return only the fresh cookie
    const cookies = jar.getCookies(url);
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].name, "fresh");
    // A second getCookies call confirms expired cookie was evicted (not just filtered)
    const cookies2 = jar.getCookies(url);
    assert.equal(cookies2.length, 1);
  });
});

describe("CookieJar — per-origin cap", () => {
  it("enforces MAX_COOKIES_PER_ORIGIN", () => {
    const jar = new CookieJar();
    for (let i = 0; i < CookieJar.MAX_COOKIES_PER_ORIGIN + 10; i++) {
      jar.setCookie(url, `cookie${i}=value${i}`);
    }
    const cookies = jar.getCookies(url);
    assert.equal(cookies.length, CookieJar.MAX_COOKIES_PER_ORIGIN);
    // The oldest cookies should have been evicted
    assert.equal(cookies[0].name, "cookie10");
  });
});

describe("CookieJar — cookie replacement", () => {
  it("replaces cookie with same name", () => {
    const jar = new CookieJar();
    jar.setCookie(url, "foo=old");
    jar.setCookie(url, "foo=new");
    const cookies = jar.getCookies(url);
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].value, "new");
  });
});

describe("CookieJar — origin scoping", () => {
  it("isolates cookies by origin", () => {
    const jar = new CookieJar();
    jar.setCookie(new URL("https://a.com"), "foo=a");
    jar.setCookie(new URL("https://b.com"), "foo=b");
    const aCookies = jar.getCookies(new URL("https://a.com"));
    const bCookies = jar.getCookies(new URL("https://b.com"));
    assert.equal(aCookies.length, 1);
    assert.equal(aCookies[0].value, "a");
    assert.equal(bCookies.length, 1);
    assert.equal(bCookies[0].value, "b");
  });

  it("returns empty array for unknown origin", () => {
    const jar = new CookieJar();
    assert.deepEqual(jar.getCookies(new URL("https://unknown.com")), []);
  });
});

describe("CookieJar.clear", () => {
  it("removes all cookies", () => {
    const jar = new CookieJar();
    jar.setCookie(url, "foo=bar");
    jar.setCookie(new URL("https://other.com"), "baz=qux");
    jar.clear();
    assert.deepEqual(jar.getCookies(url), []);
    assert.deepEqual(jar.getCookies(new URL("https://other.com")), []);
  });
});
