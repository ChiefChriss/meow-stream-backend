# MeowStream Backend

Vercel serverless API that resolves Vidking embed pages into direct `.m3u8` URLs for native AVPlayer playback.

## Endpoints

```
GET /api/stream/movie/:tmdbId
GET /api/stream/tv/:tmdbId/:season/:episode
Authorization: Bearer <APP_SECRET>   # required
```

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Test:

```bash
curl http://127.0.0.1:3000/api/stream/movie/27205
npm run test:resolve -- 27205 movie
npm run test:resolve -- 1396 tv 1 1
```

## Deploy

```bash
vercel
```

Set `APP_SECRET` and `BACKEND_PUBLIC_URL` in the Vercel dashboard. Optionally configure Upstash Redis for caching resolved URLs.

## How it works

1. Builds the Vidking embed URL from the TMDB ID
2. Loads the embed in headless Chromium (local Chrome in dev, `@sparticuz/chromium` on Vercel)
3. Captures the first `.m3u8` network request
4. Returns the stream URL plus required Referer headers for AVPlayer
