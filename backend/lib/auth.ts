import type { VercelRequest, VercelResponse } from "@vercel/node";

export function verifyAuth(req: VercelRequest): boolean {
  const secret = process.env.APP_SECRET;
  if (!secret) return false;

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === secret;
}

export function unauthorized(res: VercelResponse): void {
  res.status(401).json({ error: "Unauthorized" });
}
