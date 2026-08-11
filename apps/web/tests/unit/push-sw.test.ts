import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import { PUSH_SERVICE_WORKER_SCRIPT } from "@buildbase/sdk";

// The committed service worker (public/push-sw.js) is generated from the SDK's
// PUSH_SERVICE_WORKER_SCRIPT constant (scripts/generate-push-sw.mjs). This guards against drift:
// if the SDK ships a new SW, `npm run generate:push-sw` must be re-run and the file re-committed.
const here = dirname(fileURLToPath(import.meta.url));
const swPath = join(here, "..", "..", "public", "push-sw.js");

describe("push service worker", () => {
  it("committed public/push-sw.js matches the SDK PUSH_SERVICE_WORKER_SCRIPT byte-for-byte", () => {
    const committed = readFileSync(swPath, "utf8");
    expect(committed).toBe(PUSH_SERVICE_WORKER_SCRIPT);
  });

  it("the SW handles push + notificationclick and shows a notification", () => {
    // Sanity that we're shipping the real worker, not an empty placeholder.
    expect(PUSH_SERVICE_WORKER_SCRIPT).toContain("addEventListener('push'");
    expect(PUSH_SERVICE_WORKER_SCRIPT).toContain("addEventListener('notificationclick'");
    expect(PUSH_SERVICE_WORKER_SCRIPT).toContain("showNotification");
  });
});
