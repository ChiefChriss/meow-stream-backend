/**
 * Returns the trusted public origin for building proxy stream URLs.
 * Never derive this from the Host header — that enables cache poisoning
 * and manifest rewriting to attacker-controlled origins.
 */
export function getTrustedPublicOrigin(): string {
  const configured =
    process.env.BACKEND_PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://127.0.0.1:3000";
}
