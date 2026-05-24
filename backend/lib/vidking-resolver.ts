import type { ResolveParams, StreamResponse, SubtitleTrack } from "./types";
import { getBrowser } from "./browser";
import {
  buildProxyStreamUrl,
  createProxySession,
} from "./proxy-session";
import { bindSessionContext } from "./proxy-bind";

const VIDKING_BASE = "https://www.vidking.net";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const DEFAULT_HEADERS: Record<string, string> = {
  Referer: `${VIDKING_BASE}/`,
  Origin: VIDKING_BASE,
};

const M3U8_REGEX = /https?:\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*/gi;
const VTT_REGEX = /https?:\/\/[^\s"'<>\\]+?\.vtt[^\s"'<>\\]*/gi;

function buildEmbedUrl(params: ResolveParams): string {
  if (params.type === "movie") {
    return `${VIDKING_BASE}/embed/movie/${params.tmdbId}?autoPlay=true`;
  }
  return `${VIDKING_BASE}/embed/tv/${params.tmdbId}/${params.season}/${params.episode}?autoPlay=true`;
}

function uniqueUrls(text: string, regex: RegExp): string[] {
  return [...new Set(text.match(regex) ?? [])];
}

function pickBestM3u8(urls: string[]): string | null {
  if (urls.length === 0) return null;
  return [...urls].sort((left, right) => {
    const score = (url: string) => {
      let value = 0;
      if (/master/i.test(url)) value += 4;
      if (/index/i.test(url)) value += 2;
      return value;
    };
    return score(right) - score(left);
  })[0];
}

function buildResponse(
  streamUrl: string,
  subtitles: SubtitleTrack[],
  source: StreamResponse["source"],
  proxySessionId?: string,
): StreamResponse {
  return {
    streamUrl,
    headers: proxySessionId ? {} : DEFAULT_HEADERS,
    subtitles,
    expiresAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    source,
    proxySessionId,
  };
}

async function resolveViaPlaywright(
  params: ResolveParams,
  publicOrigin?: string,
): Promise<StreamResponse | null> {
  const embedUrl = buildEmbedUrl(params);
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: USER_AGENT });
  let keepContext = false;

  try {
    const page = await context.newPage();

    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "font", "media"].includes(type)) {
        void route.abort();
        return;
      }
      void route.continue();
    });

    const m3u8Urls: string[] = [];
    const vttUrls: string[] = [];
    let capturedManifest: string | null = null;

    page.on("request", (request) => {
      const url = request.url();
      if (url.includes(".m3u8")) m3u8Urls.push(url);
      if (url.includes(".vtt")) vttUrls.push(url);
    });

    const manifestResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(".m3u8") && response.status() >= 200 && response.status() < 400,
      { timeout: 20_000 },
    );

    await page.goto(embedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 25_000,
    });

    let streamUrl: string | null = null;
    try {
      const manifestResponse = await manifestResponsePromise;
      streamUrl = manifestResponse.url();
      capturedManifest = await manifestResponse.text();
    } catch {
      streamUrl = pickBestM3u8(m3u8Urls);
    }

    if (!streamUrl) {
      await page.waitForTimeout(3_000);
      streamUrl = pickBestM3u8(m3u8Urls);
    }

    if (!streamUrl) return null;

    const storageState = await context.storageState();
    const session = createProxySession({
      upstreamUrl: streamUrl,
      storageState,
      headers: DEFAULT_HEADERS,
      embedUrl,
      cachedManifest: capturedManifest,
    });
    bindSessionContext(session.id, context);
    keepContext = true;

    const pageHtml = await page.content();
    const subtitles = [
      ...uniqueUrls(pageHtml, VTT_REGEX).map((url, index) => ({
        label: `Subtitle ${index + 1}`,
        url,
      })),
      ...vttUrls.map((url, index) => ({
        label: `Track ${index + 1}`,
        url,
      })),
    ].filter(
      (track, index, tracks) =>
        tracks.findIndex((other) => other.url === track.url) === index,
    );

    return buildResponse(
      buildProxyStreamUrl(session.id, publicOrigin),
      subtitles,
      "playwright",
      session.id,
    );
  } finally {
    if (!keepContext) {
      await context.close().catch(() => undefined);
    }
  }
}

async function resolveViaEmbedFetch(
  params: ResolveParams,
): Promise<StreamResponse | null> {
  const response = await fetch(buildEmbedUrl(params), {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      Referer: VIDKING_BASE,
    },
  });

  if (!response.ok) return null;

  const html = await response.text();
  const streamUrl = pickBestM3u8(uniqueUrls(html, M3U8_REGEX));
  if (!streamUrl) return null;

  return buildResponse(
    streamUrl,
    uniqueUrls(html, VTT_REGEX).map((url, index) => ({
      label: `Subtitle ${index + 1}`,
      url,
    })),
    "fetch",
  );
}

export async function resolveStream(
  params: ResolveParams,
  publicOrigin?: string,
): Promise<StreamResponse> {
  const playwrightResult = await resolveViaPlaywright(params, publicOrigin);
  if (playwrightResult) return playwrightResult;

  const embedResult = await resolveViaEmbedFetch(params);
  if (embedResult) return embedResult;

  throw new Error("Could not extract stream URL from Vidking embed");
}
