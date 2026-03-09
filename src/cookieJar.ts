/** A parsed cookie with optional attributes. */
interface Cookie {
  name: string;
  value: string;
  expires?: Date;
  path?: string;
  sameSite?: "Lax" | "None" | "Strict";
  secure?: boolean;
}

/**
 * Minimal, origin-scoped cookie jar used by the Node and fetch entry points.
 *
 * @remarks
 * Cookies are keyed by origin (scheme + host + port). Expired cookies are
 * filtered out lazily when {@link getCookies} is called. The browser entry
 * point delegates cookie handling to the browser engine and does not use
 * this class.
 */
export class CookieJar {
  constructor(private jar = new Map<string, Cookie[]>()) {}

  /**
   * Store a `Set-Cookie` header value for the given URL's origin.
   *
   * @param url - The URL the response was received from.
   * @param cookieStr - Raw `Set-Cookie` header string.
   */
  setCookie(url: URL, cookieStr: string) {
    const key = url.origin.toLowerCase();
    if (!this.jar.has(key)) {
      this.jar.set(key, []);
    }

    const cookie = CookieJar.parse(cookieStr);
    this.jar.set(key, [...(this.jar.get(key)?.filter((c) => c.name !== cookie.name) || []), cookie]);
  }

  /**
   * Return all non-expired cookies for the given URL's origin.
   *
   * @param url - The URL to match cookies against.
   * @returns An array of {@link Cookie} objects (may be empty).
   */
  getCookies(url: URL): Cookie[] {
    const key = url.origin.toLowerCase();
    if (!this.jar.get(key)) {
      return [];
    }

    // Filter out expired cookies
    return this.jar.get(key)?.filter((cookie) => !cookie.expires || cookie.expires > new Date()) || [];
  }

  /**
   * Parse a raw `Set-Cookie` header string into a {@link Cookie} object.
   *
   * @param str - Raw `Set-Cookie` header value.
   * @returns Parsed cookie.
   * @throws If `str` is not a string or the cookie is malformed.
   */
  static parse(str: string): Cookie {
    if (typeof str !== "string") {
      throw new Error("argument str must be a string");
    }

    const parts = str.split(";").map((part) => part.trim());

    let cookie: Cookie;

    if (parts.length > 0) {
      const [name, value] = parts[0].split("=");
      if (!name || !value) {
        throw new Error("Invalid cookie");
      }

      cookie = {
        name,
        value,
      };
    } else {
      throw new Error("Invalid cookie");
    }

    parts.slice(1).forEach((part) => {
      const [name, value] = part.split("=");
      if (!name.trim()) {
        throw new Error("Invalid cookie");
      }

      const nameLow = name.toLowerCase();
      const val = value?.charAt(0) === "'" || value?.charAt(0) === '"' ? value?.slice(1, -1) : value;
      if (nameLow === "expires") {
        cookie.expires = new Date(val);
      }
      if (nameLow === "path") {
        cookie.path = val;
      }
      if (nameLow === "samesite") {
        if (val !== "Lax" && val !== "None" && val !== "Strict") {
          throw new Error("Invalid cookie SameSite value");
        }
        cookie.sameSite = val;
      }
      if (nameLow === "secure") {
        cookie.secure = true;
      }
    });

    return cookie;
  }
}
