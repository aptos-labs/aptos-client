/** A parsed cookie with optional attributes. */
interface Cookie {
  name: string;
  value: string;
  expires?: Date;
  sameSite?: "Lax" | "None" | "Strict";
  secure?: boolean;
  httpOnly?: boolean;
}

/**
 * Minimal, origin-scoped cookie jar used by the Node and fetch entry points.
 *
 * @remarks
 * Cookies are keyed by origin (scheme + host + port). Expired cookies are
 * filtered out lazily when {@link getCookies} is called. The browser entry
 * point delegates cookie handling to the browser engine and does not use
 * this class.
 *
 * **Note:** A single module-level `CookieJar` instance is shared across all
 * requests in the same process. In multi-tenant server-side environments,
 * create a separate instance and pass it via {@link AptosClientRequest.cookieJar}
 * to avoid cross-request cookie leakage.
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

    // RFC 6265bis: SameSite=None requires the Secure attribute
    if (cookie.sameSite === "None" && !cookie.secure) {
      return;
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

  /** Remove all stored cookies. Useful for test isolation. */
  clear() {
    this.jar.clear();
  }

  /**
   * Parse a raw `Set-Cookie` header string into a {@link Cookie} object.
   *
   * @param str - Raw `Set-Cookie` header value.
   * @returns Parsed cookie.
   * @throws If the cookie is malformed or contains control characters.
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

      // Reject control characters that could enable header injection (CRLF, null)
      if (hasControlChars(name) || hasControlChars(value)) {
        throw new Error("Invalid cookie: name or value contains control characters");
      }

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
      // Only strip quotes when both opening and closing characters match
      let val = value;
      if (value && value.length >= 2) {
        const first = value.charAt(0);
        const last = value.charAt(value.length - 1);
        if ((first === '"' || first === "'") && first === last) {
          val = value.slice(1, -1);
        }
      }
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
      if (nameLow === "httponly") {
        cookie.httpOnly = true;
      }
    });

    return cookie;
  }
}

/** Check if a string contains CR, LF, or null characters. @internal */
function hasControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x0d || code === 0x0a || code === 0x00) return true;
  }
  return false;
}
