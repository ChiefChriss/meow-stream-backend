import type { BrowserContext } from "playwright-core";
import { registerLiveContext } from "./proxy-context";

export function bindSessionContext(
  sessionId: string,
  context: BrowserContext,
): void {
  registerLiveContext(sessionId, context);
}
