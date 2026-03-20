import crypto from "crypto";
import os from "os";
import fs from "fs";
import path from "path";
import {
  getStoredLicense as dbGetStoredLicense,
  upsertLicenseRecord,
  updateLicenseAccessToken as dbUpdateLicenseAccessToken,
  deleteLicenseRecord,
  markLicenseRecordRevoked,
} from "@agentcenter/database";

// ── Types ───────────────────────────────────────────────────────

export interface AccessTokenPayload {
  typ: "access";
  lid: string;
  sub: string;
  org: string;
  plan: "starter" | "pro" | "enterprise";
  maxAgents: number;
  maxProjects: number;
  maxSeats: number;
  features: string[];
  iat: number;
  exp: number;
  iss: string;
}

export interface LicenseStatus {
  status: "active" | "expired" | "invalid" | "revoked" | "none";
  plan: string | null;
  org: string | null;
  features: string[];
  maxAgents: number;
  maxProjects: number;
  maxSeats: number;
  expiresAt: string | null;
  message: string;
}

// ── Constants ───────────────────────────────────────────────────

// Only bypass license in vitest — VITEST env is set by the test runner, not exploitable via .env
const IS_TEST = !!process.env.VITEST;
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || "https://admin.app.agentcenter.cloud";
const IS_SELF_HOSTED = !process.env.LICENSE_REFRESH_TOKEN; // hosted clients have this env injected
const REFRESH_INTERVAL_MS = IS_SELF_HOSTED
  ? 1 * 60 * 60 * 1000 // 1 hour — self-hosted polls more often (no push available)
  : 23 * 60 * 60 * 1000; // 23 hours — hosted gets pushes, just refresh before 24h expiry
const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days grace if refresh fails (network issues only)
const LICENSE_ID = "active";

// ── Public Key (bundled, env, or fetched from license server) ────

const BUNDLED_KEY_PATH = path.join(process.cwd(), "license-public.pem");
const CACHED_KEY_PATH = path.join(process.cwd(), "data", "license-public.pem");
let cachedPublicKey: string | null = null;

function getPublicKey(): string | null {
  // 1. In-memory cache
  if (cachedPublicKey) return cachedPublicKey;
  // 2. Environment variable (explicit override, highest priority)
  if (process.env.LICENSE_PUBLIC_KEY) {
    cachedPublicKey = process.env.LICENSE_PUBLIC_KEY.replace(/\\n/g, "\n");
    return cachedPublicKey;
  }
  // 3. Cached from runtime fetch (writable data dir)
  if (fs.existsSync(CACHED_KEY_PATH)) {
    cachedPublicKey = fs.readFileSync(CACHED_KEY_PATH, "utf-8");
    return cachedPublicKey;
  }
  // 4. Bundled in Docker image (static fallback)
  if (fs.existsSync(BUNDLED_KEY_PATH)) {
    cachedPublicKey = fs.readFileSync(BUNDLED_KEY_PATH, "utf-8");
    return cachedPublicKey;
  }
  return null;
}

/**
 * Fetch and cache the public key from the license server.
 * Called once during activation so offline verification works afterward.
 */
async function fetchAndCachePublicKey(force = false): Promise<boolean> {
  if (!LICENSE_SERVER_URL) return false;
  // Skip if we already have a key from env or cache — unless forced (e.g. after verification failure)
  if (!force && (fs.existsSync(CACHED_KEY_PATH) || process.env.LICENSE_PUBLIC_KEY)) return false;

  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/public-key`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.publicKey) {
      // Clear in-memory cache so getPublicKey() picks up the new key
      cachedPublicKey = data.publicKey;
      try {
        fs.writeFileSync(CACHED_KEY_PATH, data.publicKey, { mode: 0o644 });
      } catch {
        logLicense(
          "warn",
          "Could not write public key to disk (permission denied), using in-memory cache",
        );
      }
      logLicense("info", "Public key fetched and cached from license server");
      return true;
    }
  } catch {
    logLicense("warn", "Could not fetch public key from license server");
  }
  return false;
}

// ── Token Verification (offline) ────────────────────────────────

function b64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

export function verifyAccessToken(
  token: string,
  { ignoreExpiry = false }: { ignoreExpiry?: boolean } = {},
): AccessTokenPayload | null {
  if (!token) return null;

  const publicKey = getPublicKey();
  if (!publicKey) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  try {
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(signingInput);
    if (!verify.verify(publicKey, signature, "base64url")) return null;

    const payload = JSON.parse(b64urlDecode(payloadB64)) as AccessTokenPayload;
    if (payload.typ !== "access") return null;

    // Check expiry unless explicitly skipped (e.g. getLicenseStatus grace period)
    if (!ignoreExpiry && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ── Container Fingerprint ───────────────────────────────────────

function getFingerprint(): string {
  const hostname = os.hostname();
  const interfaces = os.networkInterfaces();
  const macs = Object.values(interfaces)
    .flat()
    .filter((i) => i && !i.internal && i.mac !== "00:00:00:00:00:00")
    .map((i) => i!.mac)
    .sort()
    .join(",");

  const raw = `${hostname}:${macs}:${process.pid}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

// ── DB Operations ───────────────────────────────────────────────

export async function getStoredLicense() {
  return dbGetStoredLicense(LICENSE_ID);
}

/**
 * Store both refresh + access token in DB.
 * `token` field stores the refresh token (long-lived).
 * `instanceId` stores the current access token (short-lived).
 */
async function storeLicense(
  refreshToken: string,
  accessToken: string,
  payload: AccessTokenPayload,
) {
  await upsertLicenseRecord(LICENSE_ID, {
    token: refreshToken,
    instanceId: accessToken,
    plan: payload.plan,
    org: payload.org,
    maxAgents: payload.maxAgents,
    maxProjects: payload.maxProjects,
    maxSeats: payload.maxSeats,
    features: payload.features,
    expiresAt: new Date(payload.exp * 1000),
    lastVerifiedAt: new Date(),
  });
}

/** Update just the access token after a refresh */
async function updateAccessToken(accessToken: string, payload: AccessTokenPayload) {
  await dbUpdateLicenseAccessToken(LICENSE_ID, {
    instanceId: accessToken,
    plan: payload.plan,
    org: payload.org,
    maxAgents: payload.maxAgents,
    maxProjects: payload.maxProjects,
    maxSeats: payload.maxSeats,
    features: payload.features,
    expiresAt: new Date(payload.exp * 1000),
    lastVerifiedAt: new Date(),
  });
}

export async function clearStoredLicense() {
  await deleteLicenseRecord(LICENSE_ID);
}

/** Mark the license as revoked — clears access token so status becomes "revoked" immediately */
async function markLicenseRevoked(reason: string) {
  await markLicenseRecordRevoked(LICENSE_ID);
  logLicense("warn", `License marked as revoked: ${reason}`);
}

// ── Activate License (called from /activate UI) ─────────────────

/**
 * User enters a refresh token on /activate page.
 * We call the license server to:
 *   1. Validate the refresh token
 *   2. Activate this instance
 *   3. Get the first access token
 *   4. Store both in DB
 */
export async function activateLicenseKey(
  refreshToken: string,
): Promise<{ success: boolean; message: string; status?: LicenseStatus }> {
  if (!LICENSE_SERVER_URL) {
    return { success: false, message: "License server not configured (LICENSE_SERVER_URL)" };
  }

  try {
    const fingerprint = getFingerprint();
    const appVersion = process.env.APP_VERSION || "unknown";

    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken, fingerprint, appVersion }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // Try to parse JSON error, fall back to status text
      let errorMsg = `Activation failed (${res.status})`;
      try {
        const data = await res.json();
        errorMsg = data.error || errorMsg;
      } catch {
        // Non-JSON response (e.g. "Method Not Allowed")
      }
      if (res.status === 409) {
        return {
          success: false,
          message:
            "This license is already active on another instance. Wait 2 hours or deactivate the other instance first.",
        };
      }
      return { success: false, message: errorMsg };
    }

    const data = await res.json();

    // Ensure we have the public key before verifying
    await fetchAndCachePublicKey();

    // Verify the returned access token
    let payload = verifyAccessToken(data.accessToken);

    // If verification fails, force re-fetch key (may have rotated) and retry
    if (!payload) {
      logLicense("warn", "Activation: token verification failed — re-fetching public key");
      const fetched = await fetchAndCachePublicKey(true);
      if (fetched) {
        payload = verifyAccessToken(data.accessToken);
      }
    }

    if (!payload) {
      return { success: false, message: "Received invalid access token from server" };
    }

    // Store in DB
    await storeLicense(refreshToken, data.accessToken, payload);
    invalidateLicenseCache();

    // Start auto-refresh
    startTokenRefresh();

    const status = buildStatus("active", payload, "License activated successfully");
    logLicense("info", `License activated: plan=${payload.plan} org="${payload.org}"`);

    return { success: true, message: "License activated successfully", status };
  } catch (err) {
    return {
      success: false,
      message: `Cannot reach license server: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ── Token Refresh (automatic, every ~23 hours / 1 hour) ─────────

let refreshTimer: NodeJS.Timeout | null = null;
let retryTimer: NodeJS.Timeout | null = null;
let retryAttempt = 0;
const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 30 * 60_000]; // 5min, 15min, 30min

function startTokenRefresh() {
  if (refreshTimer || !LICENSE_SERVER_URL) return;

  refreshTimer = setInterval(async () => {
    await refreshAccessToken();
  }, REFRESH_INTERVAL_MS);

  refreshTimer.unref();
}

function scheduleRetry() {
  if (retryTimer) return; // already have a retry scheduled

  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryAttempt++;

  logLicense("info", `Scheduling retry #${retryAttempt} in ${delay / 60_000}min`);

  retryTimer = setTimeout(async () => {
    retryTimer = null;
    await refreshAccessToken();
  }, delay);

  retryTimer.unref();
}

function clearRetryState() {
  retryAttempt = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

type RefreshResult = "success" | "superseded" | "revoked" | "error";

async function refreshAccessToken(): Promise<RefreshResult> {
  const stored = await getStoredLicense();
  if (!stored?.token || !LICENSE_SERVER_URL) return "error";

  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored.token }),
      signal: AbortSignal.timeout(15_000),
    });

    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      // Non-JSON response — fall through to error handling
    }

    if (res.ok && data.accessToken) {
      let payload = verifyAccessToken(data.accessToken as string);

      // If verification fails, the public key may be stale (rotated on dashboard).
      // Re-fetch and retry once before giving up.
      if (!payload) {
        logLicense("warn", "Access token signature verification failed — re-fetching public key");
        const fetched = await fetchAndCachePublicKey(true);
        if (fetched) {
          payload = verifyAccessToken(data.accessToken as string);
        }
      }

      if (payload) {
        await updateAccessToken(data.accessToken as string, payload);
        invalidateLicenseCache();
        clearRetryState();
        logLicense("info", "Access token refreshed successfully");
        return "success";
      }

      logLicense("error", "Server returned OK but access token is invalid even after key re-fetch");
      scheduleRetry();
      return "error";
    }

    // Token has been replaced by a new one (license reissued)
    if (res.status === 401 && (data.code as string) === "TOKEN_SUPERSEDED") {
      logLicense("warn", "Refresh token has been superseded — license was reissued");
      clearRetryState();
      return "superseded";
    }

    // Subscription cancelled or revoked
    if (res.status === 403) {
      const reason = (data.error as string) || "subscription inactive";
      logLicense("warn", `Token refresh denied: ${reason} — marking license revoked`);
      await markLicenseRevoked(reason);
      invalidateLicenseCache();
      stopTokenRefresh();
      clearRetryState();
      return "revoked";
    }

    logLicense("warn", `Token refresh failed: ${(data.error as string) || `status ${res.status}`}`);
    scheduleRetry();
  } catch {
    logLicense("warn", "Token refresh failed — network error");
    scheduleRetry();
  }
  return "error";
}

export function stopTokenRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  clearRetryState();
}

/**
 * Force an immediate token refresh. Called by /api/license/refresh
 * when the infra dashboard pushes a plan change.
 */
export async function forceTokenRefresh(): Promise<{
  success: boolean;
  message: string;
  plan?: string;
}> {
  const stored = await getStoredLicense();
  if (!stored?.token || !LICENSE_SERVER_URL) {
    return { success: false, message: "No license or license server configured" };
  }

  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored.token }),
      signal: AbortSignal.timeout(15_000),
    });

    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      // Non-JSON response
    }

    if (res.ok && data.accessToken) {
      let payload = verifyAccessToken(data.accessToken as string);

      if (!payload) {
        logLicense("warn", "Force refresh: token verification failed — re-fetching public key");
        const fetched = await fetchAndCachePublicKey(true);
        if (fetched) {
          payload = verifyAccessToken(data.accessToken as string);
        }
      }

      if (payload) {
        await updateAccessToken(data.accessToken as string, payload);
        invalidateLicenseCache();
        startTokenRefresh(); // restart periodic refresh if it was stopped (e.g. after a prior revoke)
        logLicense(
          "info",
          `License refreshed: plan=${payload.plan} features=[${payload.features.join(",")}]`,
        );
        return { success: true, message: "License updated", plan: payload.plan };
      }

      return { success: false, message: "Access token invalid even after key re-fetch" };
    }

    if (res.status === 403) {
      const reason = (data.error as string) || "Subscription inactive";
      await markLicenseRevoked(reason);
      invalidateLicenseCache();
      stopTokenRefresh();
      logLicense("warn", `License revoked via force refresh: ${reason}`);
      return { success: false, message: reason };
    }
    return { success: false, message: (data.error as string) || "Refresh failed" };
  } catch (err) {
    return {
      success: false,
      message: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ── Get License Status ──────────────────────────────────────────

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const stored = await getStoredLicense();

  if (!stored) {
    return buildStatus("none", null, "No license activated");
  }

  // Check if explicitly revoked
  if (stored.plan === "revoked") {
    return buildStatus("revoked", null, "License has been revoked");
  }

  // Verify access token from DB
  const accessToken = stored.instanceId; // we store access token here
  if (!accessToken) {
    return buildStatus("invalid", null, "No access token stored");
  }

  // ignoreExpiry: getLicenseStatus handles expiry itself with grace period logic
  const payload = verifyAccessToken(accessToken, { ignoreExpiry: true });
  if (!payload) {
    return buildStatus("invalid", null, "Stored access token is invalid");
  }

  const now = Math.floor(Date.now() / 1000);

  // Access token expired?
  if (payload.exp < now) {
    // Check grace period — allow up to 3 days past expiry
    const expiredMs = (now - payload.exp) * 1000;
    if (expiredMs < GRACE_PERIOD_MS) {
      return buildStatus("active", payload, "Access token expired — renewal pending");
    }
    return buildStatus("expired", payload, "License expired — please check your subscription");
  }

  return buildStatus("active", payload, "License is active");
}

// ── Cached Status ───────────────────────────────────────────────

let cachedStatus: LicenseStatus | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60_000;

async function getCachedLicenseStatus(): Promise<LicenseStatus> {
  const now = Date.now();
  if (cachedStatus && now - cacheTime < CACHE_TTL_MS) {
    return cachedStatus;
  }
  cachedStatus = await getLicenseStatus();
  cacheTime = now;
  return cachedStatus;
}

export function invalidateLicenseCache() {
  cachedStatus = null;
  cacheTime = 0;
}

export async function isLicenseActive(): Promise<boolean> {
  if (IS_TEST) return true;
  const status = await getCachedLicenseStatus();
  return status.status === "active";
}

export async function isFeatureLicensed(featureKey: string): Promise<boolean> {
  if (IS_TEST) return true;
  const status = await getCachedLicenseStatus();
  if (status.status === "active") {
    return status.features.includes(featureKey);
  }
  return false;
}

export async function checkLicenseLimit(
  resource: "agents" | "projects" | "seats",
  currentCount: number,
): Promise<{ allowed: boolean; limit: number }> {
  if (IS_TEST) return { allowed: true, limit: -1 };
  const status = await getCachedLicenseStatus();

  const limitMap = {
    agents: status.maxAgents,
    projects: status.maxProjects,
    seats: status.maxSeats,
  };
  const limit = limitMap[resource];
  if (limit === -1) return { allowed: true, limit };
  return { allowed: currentCount < limit, limit };
}

// ── Startup Cache Cleanup ────────────────────────────────────────

/**
 * Clear in-memory caches on process startup so fresh data is loaded.
 * Does NOT delete disk-cached files — they serve as fallback if the
 * license server is unreachable (important for self-hosted clients).
 * The subsequent force-fetch will overwrite the disk cache if successful.
 */
function clearStartupCache() {
  cachedPublicKey = null;
}

// ── Startup ─────────────────────────────────────────────────────

/**
 * On app startup:
 * 1. If license exists in DB → validate, refresh if needed, start timer
 * 2. If no license in DB but LICENSE_REFRESH_TOKEN env is set → auto-activate
 *    (used by hosted clients where infra injects the token into the container env)
 * 3. If neither → app shows /activate page (self-hosted first boot)
 */
export async function initLicense(): Promise<void> {
  try {
    // Clear in-memory caches and try to fetch a fresh public key.
    // If the fetch fails, the disk-cached key is still available as fallback.
    clearStartupCache();
    await fetchAndCachePublicKey(true);

    const stored = await getStoredLicense();

    const envRefreshToken = process.env.LICENSE_REFRESH_TOKEN;

    // Case 1: License already in DB
    if (stored) {
      const accessToken = stored.instanceId;
      const needsRefresh = !accessToken || !verifyAccessToken(accessToken);

      if (needsRefresh) {
        logLicense(
          "warn",
          !accessToken
            ? "No access token stored — attempting refresh"
            : "Stored access token is invalid — attempting refresh",
        );
        const refreshResult = await refreshAccessToken();

        if (refreshResult === "success") {
          startTokenRefresh();
        } else if (refreshResult === "superseded" && envRefreshToken && LICENSE_SERVER_URL) {
          // Hosted mode: refresh token was replaced (license reissued).
          // Clear stale DB entry and re-activate with the fresh env token.
          logLicense("info", "Token superseded — re-activating from env");
          await clearStoredLicense();
          invalidateLicenseCache();
          const result = await activateLicenseKey(envRefreshToken);
          if (result.success) {
            logLicense("info", "Re-activation from env successful");
          } else {
            logLicense("warn", `Re-activation from env failed: ${result.message}`);
          }
        } else if (refreshResult === "revoked") {
          // Already marked revoked by refreshAccessToken — nothing more to do
          logLicense("warn", "License has been revoked");
        } else {
          // Network/server error — keep expired token in DB for grace period,
          // retry timer is already scheduled by refreshAccessToken
          startTokenRefresh();
        }
        return;
      }

      const payload = verifyAccessToken(accessToken!)!;
      const now = Math.floor(Date.now() / 1000);
      const hoursLeft = Math.round((payload.exp - now) / 3600);
      logLicense(
        "info",
        `License loaded: plan=${payload.plan} org="${payload.org}" expires_in=${hoursLeft}h`,
      );

      if (payload.exp - now < 2 * 3600) {
        logLicense("info", "Access token expiring soon — refreshing now");
        await refreshAccessToken();
      }

      startTokenRefresh();
      return;
    }

    // Case 2: No license in DB, but refresh token in env → auto-activate (hosted)
    if (envRefreshToken && LICENSE_SERVER_URL) {
      logLicense("info", "No license in DB — auto-activating from LICENSE_REFRESH_TOKEN env");
      const result = await activateLicenseKey(envRefreshToken);
      if (result.success) {
        logLicense("info", "Auto-activation successful");
      } else {
        logLicense("warn", `Auto-activation failed: ${result.message}`);
      }
      return;
    }

    // Case 3: No license, no env token → show /activate (self-hosted)
    logLicense("info", "No license found — app will show activation screen");
  } catch (err) {
    logLicense("warn", `License init error: ${err instanceof Error ? err.message : "unknown"}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function buildStatus(
  status: LicenseStatus["status"],
  payload: AccessTokenPayload | null,
  message: string,
): LicenseStatus {
  return {
    status,
    plan: payload?.plan ?? null,
    org: payload?.org ?? null,
    features: payload?.features ?? [],
    maxAgents: payload?.maxAgents ?? 0,
    maxProjects: payload?.maxProjects ?? 0,
    maxSeats: payload?.maxSeats ?? 0,
    expiresAt: payload ? new Date(payload.exp * 1000).toISOString() : null,
    message,
  };
}

function logLicense(level: string, message: string) {
  const log = { timestamp: new Date().toISOString(), level, tag: "license", message };
  if (level === "error") console.error(JSON.stringify(log));
  else if (level === "warn") console.warn(JSON.stringify(log));
  else if (level !== "debug" || process.env.NODE_ENV !== "production")
    console.info(JSON.stringify(log));
}
