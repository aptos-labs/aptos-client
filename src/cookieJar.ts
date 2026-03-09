/** A parsed cookie with optional attributes. */
interface Cookie {
  name: string;
  value: string;
  expires?: Date;
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
    let cookie: Cookie;
    try {
      cookie = CookieJar.parse(cookieStr);
    } catch {
      return; // Silently skip malformed cookies, matching browser behavior
    }

    const key = url.origin.toLowerCase();
    if (!this.jar.has(key)) {
      this.jar.set(key, []);
    }

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

    const isSecure = url.protocol === "https:";
    return (
      this.jar.get(key)?.filter((cookie) => {
        if (cookie.expires && cookie.expires <= new Date()) return false;
        if (cookie.secure && !isSecure) return false;
        return true;
      }) || []
    );
  }

  /**
   * Parse a raw `Set-Cookie` header string into a {@link Cookie} object.
   *
   * @param str - Raw `Set-Cookie` header value.
   * @returns Parsed cookie.
   * @throws If the cookie is malformed.
   */
  static parse(str: string): Cookie {
    const parts = str.split(";").map((part) => part.trim());

    let cookie: Cookie;

    if (parts.length > 0) {
      const eqIdx = parts[0].indexOf("=");
      if (eqIdx < 1) {
        throw new Error("Invalid cookie");
      }
      const name = parts[0].slice(0, eqIdx);
      const value = parts[0].slice(eqIdx + 1);

      cookie = {
        name,
        value,
      };
    } else {
      throw new Error("Invalid cookie");
    }

    parts.slice(1).forEach((part) => {
      const attrEqIdx = part.indexOf("=");
      const name = attrEqIdx === -1 ? part : part.slice(0, attrEqIdx);
      const value = attrEqIdx === -1 ? undefined : part.slice(attrEqIdx + 1);
      if (!name.trim()) {
        throw new Error("Invalid cookie");
      }

      const nameLow = name.toLowerCase();
      const val = value?.charAt(0) === "'" || value?.charAt(0) === '"' ? value?.slice(1, -1) : value;
      if (nameLow === "expires" && val) {
        const date = new Date(val);
        if (!Number.isNaN(date.getTime())) {
          cookie.expires = date;
        }
      }
      if (nameLow === "samesite") {
        const normalized = val?.toLowerCase();
        if (normalized === "lax") cookie.sameSite = "Lax";
        else if (normalized === "none") cookie.sameSite = "None";
        else if (normalized === "strict") cookie.sameSite = "Strict";
      }
      if (nameLow === "secure") {
        cookie.secure = true;
      }
    });

    return cookie;
  }
}
