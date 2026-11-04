import dns from "node:dns/promises";
import net from "node:net";

export interface SecurityCheckResult {
  isSafe: boolean;
  reason?: string;
  normalizedUrl?: string;
}

/**
 * Checks whether an IP address belongs to private, loopback, or reserved ranges (SSRF protection).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [p0, p1] = parts;

    // Loopback (127.0.0.0/8)
    if (p0 === 127) return true;
    // Current network (0.0.0.0/8)
    if (p0 === 0) return true;
    // Private-use 10.0.0.0/8
    if (p0 === 10) return true;
    // Private-use 172.16.0.0/12
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // Private-use 192.168.0.0/16
    if (p0 === 192 && p1 === 168) return true;
    // Link-local / Cloud metadata service (169.254.0.0/16, e.g. 169.254.169.254)
    if (p0 === 169 && p1 === 254) return true;
    // Broadcast / Multicast (224.0.0.0/4 and 255.255.255.255)
    if (p0 >= 224) return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Loopback ::1 or unspecified ::
    if (lower === "::1" || lower === "::" || lower.startsWith("::ffff:127.")) return true;
    // Link-local (fe80::/10)
    if (lower.startsWith("fe80:") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    // Unique local (fc00::/7)
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

    return false;
  }

  return false;
}

/**
 * Validates a target URL against SSRF and protocol restrictions.
 */
export async function validateUrlSecurity(urlString: string): Promise<SecurityCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return { isSafe: false, reason: "Malformed or unparseable URL." };
  }

  // Enforce http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isSafe: false, reason: "Only HTTP and HTTPS URLs are permitted." };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Obvious local hostnames
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".onion")
  ) {
    return { isSafe: false, reason: "Access to local or reserved domains is prohibited." };
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return { isSafe: false, reason: "Access to private or loopback IP addresses is prohibited." };
    }
  } else {
    // Perform DNS lookup to prevent DNS-rebinding or resolution to private IP (e.g. *.nip.io)
    try {
      const records = await dns.lookup(hostname, { all: true });
      for (const record of records) {
        if (isPrivateOrReservedIp(record.address)) {
          return { isSafe: false, reason: "Domain resolves to a private or internal network address." };
        }
      }
    } catch {
      return { isSafe: false, reason: "Unable to resolve target domain host." };
    }
  }

  return {
    isSafe: true,
    normalizedUrl: parsed.toString(),
  };
}

/**
 * Safe fetcher that enforces timeout, size limit, and security headers.
 */
export async function safeFetchHtml(url: string, timeoutMs = 12000): Promise<{ html: string; status: number; finalUrl: string }> {
  const security = await validateUrlSecurity(url);
  if (!security.isSafe) {
    throw new Error(`Security validation failed: ${security.reason}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(security.normalizedUrl || url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    // Verify redirected URL as well
    if (response.url && response.url !== url) {
      const redirectSecurity = await validateUrlSecurity(response.url);
      if (!redirectSecurity.isSafe) {
        throw new Error(`Redirect blocked: ${redirectSecurity.reason}`);
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    // Limit read size to 5MB
    const text = await response.text();
    if (text.length > 5 * 1024 * 1024) {
      return { html: text.slice(0, 5 * 1024 * 1024), status: response.status, finalUrl: response.url || url };
    }

    return { html: text, status: response.status, finalUrl: response.url || url };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out while connecting to the news website.");
    }
    throw err;
  }
}
