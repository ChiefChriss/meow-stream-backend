import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { URL } from "node:url";
import proxyHandler from "../api/proxy/[sessionId]/[[...path]].ts";
import movieHandler from "../api/stream/movie/[tmdbId].ts";
import tvHandler from "../api/stream/tv/[tmdbId]/[season]/[episode].ts";

function toVercelRequest(
  req: IncomingMessage,
  params: Record<string, string | string[] | undefined>,
): Parameters<typeof movieHandler>[0] {
  const url = new URL(req.url ?? "/", "http://localhost");
  return {
    method: req.method ?? "GET",
    headers: req.headers as Record<string, string | string[] | undefined>,
    query: {
      ...Object.fromEntries(url.searchParams.entries()),
      ...params,
    },
    body: undefined,
  } as Parameters<typeof movieHandler>[0];
}

function toVercelResponse(res: ServerResponse): Parameters<typeof movieHandler>[1] {
  return {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(body: unknown) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
      return this;
    },
    send(body: string | Buffer) {
      res.end(body);
      return this;
    },
    setHeader(name: string, value: string) {
      res.setHeader(name, value);
      return this;
    },
  } as Parameters<typeof movieHandler>[1];
}

const port = Number(process.env.PORT ?? 3000);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);

  try {
    const proxyMatch = url.pathname.match(/^\/api\/proxy\/([^/]+)(?:\/.*)?$/);
    if (proxyMatch) {
      await proxyHandler(
        toVercelRequest(req, { sessionId: proxyMatch[1] }),
        toVercelResponse(res),
      );
      return;
    }

    const movieMatch = url.pathname.match(/^\/api\/stream\/movie\/(\d+)$/);
    if (movieMatch) {
      await movieHandler(
        toVercelRequest(req, { tmdbId: movieMatch[1] }),
        toVercelResponse(res),
      );
      return;
    }

    const tvMatch = url.pathname.match(/^\/api\/stream\/tv\/(\d+)\/(\d+)\/(\d+)$/);
    if (tvMatch) {
      await tvHandler(
        toVercelRequest(req, {
          tmdbId: tvMatch[1],
          season: tvMatch[2],
          episode: tvMatch[3],
        }),
        toVercelResponse(res),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[dev-server]", message);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: message }));
    }
  }
}).listen(port, () => {
  console.log(`MeowStream backend listening on http://127.0.0.1:${port}`);
});
