// Regenerates apps/web/public/push-sw.js from the @buildbase/sdk source of truth.
//
// The push service worker is NOT hand-written — it is the ready-made script the SDK ships as the
// `PUSH_SERVICE_WORKER_SCRIPT` constant. We commit the rendered file (so it is served at a stable
// path, `/push-sw.js`, the SDK's `PushNotificationProvider` default) AND keep this generator so the
// committed copy can be regenerated after an SDK bump. `tests/unit/push-sw.test.ts` guards against
// drift between the committed file and the constant.
//
// Usage: `npm run generate:push-sw` (from apps/web).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PUSH_SERVICE_WORKER_SCRIPT } from "@buildbase/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "public", "push-sw.js");

writeFileSync(target, PUSH_SERVICE_WORKER_SCRIPT, "utf8");
console.log(`Wrote ${PUSH_SERVICE_WORKER_SCRIPT.length} bytes to ${target}`);
