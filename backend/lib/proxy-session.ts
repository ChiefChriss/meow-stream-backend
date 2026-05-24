import { randomUUID } from "node:crypto";
import { disposeLiveContext } from "./proxy-context";
import { collectHostnamesFromManifest } from "./proxy-url";
import { getTrustedPublicOrigin } from "./public-origin";

export interface ProxySession {
  id: string;
  upstreamUrl: string;
  allowedHostnames?: string[];
  storageState: {
    cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "Strict" | "Lax" | "None";
    }>;
    origins?: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }>;
  };
  headers: Record<string, string>;
  embedUrl: string;
  cachedManifest?: string | null;
  createdAt: number;
}

const SESSION_TTL_MS = 45 * 60 * 1000;
const sessions = new Map<string, ProxySession>();

export function createProxySession(
  input: Omit<ProxySession, "id" | "createdAt" | "allowedHostnames">,
): ProxySession {
  purgeExpiredSessions();
  const allowedHostnames = new Set<string>();
  try {
    allowedHostnames.add(new URL(input.upstreamUrl).hostname);
  } catch {
    // upstreamUrl is validated before session creation.
  }
  if (input.cachedManifest) {
    for (const hostname of collectHostnamesFromManifest(
      input.cachedManifest,
      input.upstreamUrl,
    )) {
      allowedHostnames.add(hostname);
    }
  }
  const session: ProxySession = {
    id: randomUUID(),
    createdAt: Date.now(),
    allowedHostnames: [...allowedHostnames],
    ...input,
  };
  sessions.set(session.id, session);
  return session;
}

export function getProxySession(sessionId: string): ProxySession | null {
  purgeExpiredSessions();
  return sessions.get(sessionId) ?? null;
}

function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      void disposeLiveContext(id);
    }
  }
}

export function buildProxyStreamUrl(sessionId: string, baseUrl?: string): string {
  const root = baseUrl ?? getTrustedPublicOrigin();
  return `${root.replace(/\/$/, "")}/api/proxy/${sessionId}/manifest.m3u8`;
}
