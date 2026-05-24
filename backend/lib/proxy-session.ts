import { randomUUID } from "node:crypto";

export interface ProxySession {
  id: string;
  upstreamUrl: string;
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

export function createProxySession(input: Omit<ProxySession, "id" | "createdAt">): ProxySession {
  purgeExpiredSessions();
  const session: ProxySession = {
    id: randomUUID(),
    createdAt: Date.now(),
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
    }
  }
}

export function buildProxyStreamUrl(sessionId: string, baseUrl?: string): string {
  const root =
    baseUrl ??
    process.env.BACKEND_PUBLIC_URL ??
    (process.env.RENDER_EXTERNAL_URL
      ? process.env.RENDER_EXTERNAL_URL
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://127.0.0.1:3000");

  return `${root.replace(/\/$/, "")}/api/proxy/${sessionId}/manifest.m3u8`;
}
