import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth, unauthorized } from "../../../../../lib/auth";
import {
  cacheKey,
  getCachedStream,
  setCachedStream,
} from "../../../../../lib/cache";
import { getTrustedPublicOrigin } from "../../../../../lib/public-origin";
import { resolveStream } from "../../../../../lib/vidking-resolver";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAuth(req)) {
    return unauthorized(res);
  }

  const { tmdbId, season, episode } = req.query;

  if (typeof tmdbId !== "string" || !/^\d+$/.test(tmdbId)) {
    return res.status(400).json({ error: "Invalid TMDB ID" });
  }
  if (typeof season !== "string" || !/^\d+$/.test(season)) {
    return res.status(400).json({ error: "Invalid season" });
  }
  if (typeof episode !== "string" || !/^\d+$/.test(episode)) {
    return res.status(400).json({ error: "Invalid episode" });
  }

  const key = cacheKey("tv", tmdbId, season, episode);
  const cached = await getCachedStream(key);
  if (cached) {
    return res.status(200).json(cached);
  }

  try {
    const stream = await resolveStream(
      {
        type: "tv",
        tmdbId,
        season,
        episode,
      },
      getTrustedPublicOrigin(),
    );
    await setCachedStream(key, stream);
    return res.status(200).json(stream);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stream resolution failed";
    return res.status(502).json({ error: message });
  }
}
