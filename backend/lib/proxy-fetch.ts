import type { ProxySession } from "./proxy-session";
import { getBrowser } from "./browser";
import {
  disposeLiveContext,
  getLiveContext,
  registerLiveContext,
} from "./proxy-context";
import { assertAllowedProxyUrl, recordManifestHostnames } from "./proxy-url";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function createContext(session: ProxySession) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    // Playwright's generated storage state is compatible at runtime.
    storageState: session.storageState as never,
  });
  registerLiveContext(session.id, context);
  const page = await context.newPage();
  await page.goto(session.embedUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  return context;
}

async function getContextForSession(session: ProxySession) {
  const live = getLiveContext(session.id);
  if (live) return live;
  return createContext(session);
}

export async function fetchThroughSession(
  session: ProxySession,
  targetUrl: string,
): Promise<{ body: Buffer; contentType: string }> {
  assertAllowedProxyUrl(targetUrl, session);

  const context = await getContextForSession(session);
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    const result = await page.evaluate(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return {
        contentType:
          response.headers.get("content-type") ?? "application/octet-stream",
        body: Array.from(new Uint8Array(buffer)),
      };
    }, targetUrl);

    return {
      body: Buffer.from(result.body),
      contentType: result.contentType,
    };
  } catch (error) {
    await disposeLiveContext(session.id);
    throw error;
  }
}

export function rewriteManifest(
  manifest: string,
  session: ProxySession,
  proxyBase: string,
): string {
  recordManifestHostnames(session, manifest, session.upstreamUrl);

  const baseUrl = session.upstreamUrl;

  return manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          const absolute = toAbsoluteUrl(uri, baseUrl);
          return `URI="${proxyBase}?url=${encodeURIComponent(absolute)}"`;
        });
      }

      const absolute = toAbsoluteUrl(trimmed, baseUrl);
      return `${proxyBase}?url=${encodeURIComponent(absolute)}`;
    })
    .join("\n");
}

function toAbsoluteUrl(value: string, baseUrl: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return new URL(value, baseUrl).href;
}
