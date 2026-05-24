import type { BrowserContext } from "playwright-core";

const liveContexts = new Map<string, BrowserContext>();

export function registerLiveContext(
  sessionId: string,
  context: BrowserContext,
): void {
  liveContexts.set(sessionId, context);
}

export function getLiveContext(sessionId: string): BrowserContext | null {
  return liveContexts.get(sessionId) ?? null;
}

export async function disposeLiveContext(sessionId: string): Promise<void> {
  const context = liveContexts.get(sessionId);
  if (!context) return;
  liveContexts.delete(sessionId);
  await context.close().catch(() => undefined);
}

export async function disposeAllLiveContexts(): Promise<void> {
  await Promise.all(
    [...liveContexts.keys()].map((sessionId) => disposeLiveContext(sessionId)),
  );
}
