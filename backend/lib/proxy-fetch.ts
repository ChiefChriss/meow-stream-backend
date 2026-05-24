import type { ProxySession } from "./proxy-session";
import {
  disposeLiveContext,
  getLiveContext,
} from "./proxy-context";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let browserPromise: ReturnType<typeof launchBrowser> | null = null;

async function launchBrowser() {
  const { chromium } = await import("playwright-core");

  if (process.env.VERCEL === "1") {
    const chromiumPkg = await import("@sparticuz/chromium");
    return chromium.launch({
      args: chromiumPkg.default.args,
      executablePath: await chromiumPkg.default.executablePath(),
      headless: true,
    });
  }

  const isLocal = !process.env.RENDER && !process.env.CI;
  if (isLocal) {
    return chromium.launch({ channel: "chrome", headless: true });
  }

  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }
  return browserPromise;
}

async function createContext(session: ProxySession) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    // Playwright's generated storage state is compatible at runtime.
    storageState: session.storageState as never,
  });
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
  const context = await getContextForSession(session);
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    const result = await page.evaluate(async (url) => {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response as ArrayBuffer);
            return;
          }
          reject(new Error(`XHR failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("XHR network error"));
        xhr.send();
      });

      return {
        contentType: "application/octet-stream",
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
