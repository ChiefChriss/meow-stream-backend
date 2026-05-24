import type { ProxySession } from "./proxy-session";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".localhost")) return true;
  if (lower.endsWith(".internal")) return true;

  // IPv4 literals and IPv6 loopback
  if (lower === "127.0.0.1" || lower === "::1" || lower === "[::1]") {
    return true;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return true;
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  return false;
}

function toAbsoluteUrl(value: string, baseUrl: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return new URL(value, baseUrl).href;
}

function extractManifestUrls(manifest: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const line of manifest.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      const uriMatch = /URI="([^"]+)"/.exec(trimmed);
      if (uriMatch) urls.push(toAbsoluteUrl(uriMatch[1], baseUrl));
      continue;
    }
    urls.push(toAbsoluteUrl(trimmed, baseUrl));
  }
  return urls;
}

export function collectHostnamesFromManifest(
  manifest: string,
  baseUrl: string,
): string[] {
  const hostnames = new Set<string>();
  for (const url of extractManifestUrls(manifest, baseUrl)) {
    try {
      hostnames.add(new URL(url).hostname);
    } catch {
      // Ignore malformed manifest entries.
    }
  }
  return [...hostnames];
}

export function getAllowedHostnames(session: ProxySession): Set<string> {
  const hostnames = new Set<string>(session.allowedHostnames ?? []);
  try {
    hostnames.add(new URL(session.upstreamUrl).hostname);
  } catch {
    // upstreamUrl is always valid when the session is created.
  }
  if (session.cachedManifest) {
    for (const hostname of collectHostnamesFromManifest(
      session.cachedManifest,
      session.upstreamUrl,
    )) {
      hostnames.add(hostname);
    }
  }
  return hostnames;
}

export function assertAllowedProxyUrl(
  targetUrl: string,
  session: ProxySession,
): void {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error("Invalid proxy URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid proxy URL scheme");
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("Proxy URL not allowed");
  }

  const allowed = getAllowedHostnames(session);
  if (!allowed.has(parsed.hostname)) {
    throw new Error("Proxy URL not allowed for this session");
  }
}

export function recordManifestHostnames(
  session: ProxySession,
  manifest: string,
  baseUrl: string,
): void {
  const hostnames = new Set(session.allowedHostnames ?? []);
  for (const hostname of collectHostnamesFromManifest(manifest, baseUrl)) {
    hostnames.add(hostname);
  }
  session.allowedHostnames = [...hostnames];
}
