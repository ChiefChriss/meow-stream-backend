export type MediaType = "movie" | "tv";

export interface SubtitleTrack {
  label: string;
  url: string;
  language?: string;
}

export interface StreamResponse {
  streamUrl: string;
  headers: Record<string, string>;
  subtitles: SubtitleTrack[];
  expiresAt: string;
  source: "fetch" | "playwright";
  proxySessionId?: string;
}

export interface ResolveParams {
  type: MediaType;
  tmdbId: string;
  season?: string;
  episode?: string;
}
