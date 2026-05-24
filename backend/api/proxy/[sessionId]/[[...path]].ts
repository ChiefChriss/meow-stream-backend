import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchThroughSession, rewriteManifest } from "../../../lib/proxy-fetch";
import { getProxySession } from "../../../lib/proxy-session";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionId = req.query.sessionId;
  if (typeof sessionId !== "string") {
    return res.status(400).json({ error: "Missing session ID" });
  }

  const session = getProxySession(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Proxy session expired" });
  }

  const targetParam = req.query.url;
  const targetUrl =
    typeof targetParam === "string" && targetParam.length > 0
      ? targetParam
      : session.upstreamUrl;

  const host = req.headers.host ?? "127.0.0.1:3000";
  const protocol = host.includes("localhost") || host.startsWith("127.0.0.1")
    ? "http"
    : "https";
  const proxyBase = `${protocol}://${host}/api/proxy/${sessionId}`;

  try {
    if (
      targetUrl === session.upstreamUrl ||
      targetUrl.endsWith(".m3u8") ||
      !targetParam
    ) {
      if (session.cachedManifest) {
        const rewritten = rewriteManifest(
          session.cachedManifest,
          session,
          proxyBase,
        );
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-cache");
        return res.status(200).send(rewritten);
      }
    }

    const upstream = await fetchThroughSession(session, targetUrl);
    const isManifest =
      targetUrl.includes(".m3u8") ||
      upstream.contentType.includes("mpegurl") ||
      upstream.contentType.includes("m3u8");

    if (isManifest) {
      const rewritten = rewriteManifest(
        upstream.body.toString("utf8"),
        session,
        proxyBase,
      );
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");
      return res.status(200).send(rewritten);
    }

    res.setHeader("Content-Type", upstream.contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(upstream.body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Proxy fetch failed";
    return res.status(502).json({ error: message });
  }
}
