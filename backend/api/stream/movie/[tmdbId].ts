import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth, unauthorized } from "../../../lib/auth";
import { cacheKey, getCachedStream, setCachedStream } from "../../../lib/cache";
import { resolveStream } from "../../../lib/vidking-resolver";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAuth(req)) {
    return unauthorized(res);
  }

  const tmdbId = req.query.tmdbId;
  if (typeof tmdbId !== "string" || !/^\d+$/.test(tmdbId)) {
    return res.status(400).json({ error: "Invalid TMDB ID" });
  }

  const key = cacheKey("movie", tmdbId);
  const cached = await getCachedStream(key);
  if (cached) {
    return res.status(200).json(cached);
  }

  try {
    const host = req.headers.host ?? "127.0.0.1:3000";
    const protocol =
      host.includes("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";
    const stream = await resolveStream(
      { type: "movie", tmdbId },
      `${protocol}://${host}`,
    );
    await setCachedStream(key, stream);
    return res.status(200).json(stream);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stream resolution failed";
    return res.status(502).json({ error: message });
  }
}
