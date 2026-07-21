import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

// SSRF guard (parity #138 — remote-http-endpoint-guard). Validates every OUTBOUND HTTP endpoint that
// an agent/user-supplied URL would hit — parses the URL, resolves DNS, and blocks private / loopback /
// link-local / CGNAT / metadata / reserved IP ranges (IPv4 + IPv6) before the request is made. Use
// `guardedFetch` at any call site whose URL is influenced by agent/user data (webhooks, monitors,
// external links, provider bridges). Trusted hardcoded hosts (Stripe, license server) don't need it.
//
// Security posture: ON by default. The only escape hatch is the server-side env
// `SSRF_ALLOW_PRIVATE_NETWORK=1` (or per-call `allowPrivateNetwork`) — never a default-off feature flag.

const DEFAULT_DNS_TIMEOUT_MS = 5_000;

type LookupResult = { address: string; family: number };

export type RemoteHttpEndpointLookup = (hostname: string) => Promise<LookupResult[]>;

export type RemoteHttpEndpointGuardOptions = {
  /** Bypass the guard (dev/testing, or a deliberately-internal call). */
  allowPrivateNetwork?: boolean;
  dnsTimeoutMs?: number;
  /** Injectable DNS resolver (tests). */
  lookup?: RemoteHttpEndpointLookup;
};

export type RemoteHttpEndpointErrorFactory = (message: string, code: string) => Error;

/** Default error factory — attaches a machine-readable `code` to the thrown Error. */
export function guardError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Global bypass via env (e.g. local dev hitting internal services). Default: guard active. */
function isPrivateNetworkAllowedByEnv(): boolean {
  const v = process.env.SSRF_ALLOW_PRIVATE_NETWORK;
  return v === "1" || v === "true";
}

export function parseRemoteHttpEndpoint(
  value: unknown,
  error: RemoteHttpEndpointErrorFactory = guardError,
): URL {
  if (typeof value !== "string" || value.trim().length === 0) {
    if (value instanceof URL) return value;
    throw error("Outbound request requires a URL", "remote_http_url_missing");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw error("Outbound request URL is invalid", "remote_http_url_invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw error("Outbound request URL must use http or https", "remote_http_url_invalid");
  }
  return parsed;
}

export async function assertPublicRemoteHttpEndpoint(
  endpoint: URL,
  options: RemoteHttpEndpointGuardOptions = {},
  error: RemoteHttpEndpointErrorFactory = guardError,
): Promise<void> {
  if (options.allowPrivateNetwork || isPrivateNetworkAllowedByEnv()) return;

  const hostname = endpoint.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw error(
      "Outbound request URL cannot target private or reserved network addresses",
      "remote_http_private_endpoint",
    );
  }

  const literalVersion = isIP(hostname);
  if (literalVersion !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      throw error(
        "Outbound request URL cannot target private or reserved network addresses",
        "remote_http_private_endpoint",
      );
    }
    return;
  }

  let results: LookupResult[];
  try {
    results = await lookupWithTimeout(
      hostname,
      options.lookup ?? defaultLookup,
      options.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS,
    );
  } catch {
    throw error("Outbound request hostname could not be resolved", "remote_http_dns_failed");
  }
  if (results.length === 0) {
    throw error("Outbound request hostname did not resolve", "remote_http_dns_failed");
  }
  if (results.some((result) => isPrivateOrReservedIp(result.address))) {
    throw error(
      "Outbound request URL cannot resolve to private or reserved network addresses",
      "remote_http_private_endpoint",
    );
  }
}

/**
 * SSRF-guarded `fetch`. Parses + validates the URL against private/reserved ranges (blocking on the
 * resolved IPs), then performs the request. Use for any outbound call whose URL comes from agent/user
 * data. Throws a guard Error (with `code`) before any network egress on a blocked target.
 */
export async function guardedFetch(
  url: string | URL,
  init?: RequestInit,
  options: RemoteHttpEndpointGuardOptions = {},
): Promise<Response> {
  const endpoint = url instanceof URL ? url : parseRemoteHttpEndpoint(url);
  await assertPublicRemoteHttpEndpoint(endpoint, options);
  return fetch(endpoint, init);
}

function defaultLookup(hostname: string): Promise<LookupResult[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

async function lookupWithTimeout(
  hostname: string,
  lookup: RemoteHttpEndpointLookup,
  timeoutMs: number,
): Promise<LookupResult[]> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      lookup(hostname),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`DNS lookup timed out for ${hostname}`));
        }, timeoutMs);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isPrivateOrReservedIp(address: string): boolean {
  const lower = address.toLowerCase();
  const mappedIpv4 = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4?.[1]) return isPrivateOrReservedIpv4(mappedIpv4[1]);
  const mappedIpv4Hex = parseMappedIpv4Hex(lower);
  if (mappedIpv4Hex) return isPrivateOrReservedIpv4(mappedIpv4Hex);
  if (isIP(address) === 4) return isPrivateOrReservedIpv4(address);
  if (isIP(address) === 6) return isPrivateOrReservedIpv6(lower);
  return true;
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const octets = parseIpv4Address(address);
  if (!octets) return true;
  const [a, b, c] = octets;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved (224.0.0.0+)
  return false;
}

function parseIpv4Address(address: string): [number, number, number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const parsed = parts.map((part) => {
    if (!/^\d+$/.test(part)) return NaN;
    return Number(part);
  });
  if (parsed.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parsed as [number, number, number, number];
}

function parseMappedIpv4Hex(address: string): string | null {
  const match = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!match) return null;
  const hi = Number.parseInt(match[1]!, 16);
  const lo = Number.parseInt(match[2]!, 16);
  if (!Number.isInteger(hi) || !Number.isInteger(lo)) return null;
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isPrivateOrReservedIpv6(address: string): boolean {
  if (address === "::" || address === "::1") return true; // unspecified + loopback
  if (address.startsWith("fc") || address.startsWith("fd")) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(address)) return true; // link-local fe80::/10
  if (address.startsWith("ff")) return true; // multicast
  if (address === "100::" || address.startsWith("100:")) return true; // discard-only 100::/64
  if (/^2001:(?:0{0,4}:|:)/.test(address)) return true; // 2001:0000::/23 (Teredo etc.)
  if (address.startsWith("2001:db8:") || address === "2001:db8::") return true; // documentation
  if (address.startsWith("2001:2:") || address === "2001:2::") return true; // benchmarking
  if (/^2001:0?2[0-9a-f]:/.test(address)) return true; // 2001:20::/28 ORCHIDv2
  if (address.startsWith("2002:")) return true; // 6to4
  if (address.startsWith("64:ff9b:")) return true; // NAT64
  return false;
}
