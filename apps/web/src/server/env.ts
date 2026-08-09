import { z } from "zod";

/**
 * Server-side environment variable validation.
 *
 * Import `env` anywhere on the server to get a typed, validated
 * object. Validation is strict in production runtime but lenient
 * during `next build` (where runtime secrets aren't available).
 */

const serverSchema = z.object({
  // ── Database ─────────────────────────────────────────────
  POSTGRES_PRISMA_URL: z.string().min(1, "Pooled Postgres connection string is required"),
  POSTGRES_URL_NON_POOLING: z.string().min(1, "Direct Postgres connection string is required"),

  // ── Auth ─────────────────────────────────────────────────
  AUTH_SECRET: z
    .string()
    .min(16, "AUTH_SECRET must be at least 16 characters")
    .refine((s) => s !== "mc-dev-secret-change-in-production", {
      message: "AUTH_SECRET must not be the default dev value in production",
    }),

  // ── Cloudflare R2 Storage (optional — only needed for file deliverables) ──
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default("mnc"),
  R2_PREFIX: z.string().default(""),

  // ── Cron ─────────────────────────────────────────────────
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),

  // ── Cloud Deployments (optional — only needed for Deploy to Cloud) ──
  // ── Sandbox + host providers (Tier D) ──
  // BYO: Hetzner host provisioning reads the workspace's own HETZNER_API_TOKEN from the secrets
  // vault (not deployment env), same as the cloud sandbox providers. No operator infra credentials.
  // BYO: every cloud sandbox provider reads its credentials from the WORKSPACE secrets vault (by
  // secret name — e.g. E2B_API_KEY, MODAL_TOKEN_ID/SECRET, CLOUDFLARE_SANDBOX_BRIDGE_URL/TOKEN,
  // KUBECONFIG, EXE_DEV_API_KEY), NOT from deployment env. So there are intentionally no sandbox
  // provider env vars here.
  DEPLOYMENT_WEBHOOK_BASE_URL: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
  SSH_KEY_ENCRYPTION_SECRET: z.string().optional(),
  // Master key for the Epic #5 secrets vault (AES-256-GCM). Required (>=32 chars) in production;
  // dev/test fall back to an insecure default in secrets-crypto.ts.
  SECRET_ENCRYPTION_KEY: z.string().optional(),

  // Web Push removed — buildbase owns push delivery (its own service worker + subscription).

  // ── Email via Resend (optional — only needed for email notifications) ──
  RESEND_API_KEY: z.string().optional(),
  NOTIFICATION_FROM_EMAIL: z
    .union([z.string().email(), z.literal("")])
    .optional()
    .transform((v) => v || undefined),

  // ── License ─────────────────────────────────────────────────
  LICENSE_SERVER_URL: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
  LICENSE_REFRESH_TOKEN: z.string().optional(),
  LICENSE_PUBLIC_KEY: z.string().optional(),

  // ── Redis (optional — only needed when using pub/sub or caching) ──
  REDIS_URL: z.string().url().optional(),

  // ── Support ─────────────────────────────────────────────
  SUPPORT_EMAIL: z
    .union([z.string().email(), z.literal("")])
    .optional()
    .transform((v) => v || undefined)
    .default("dharmendra@agentcenter.cloud"),
  SLACK_SUPPORT_WEBHOOK_URL: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => v || undefined),

  // ── Optional ─────────────────────────────────────────────
  NEXT_PUBLIC_MC_URL: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
  VERCEL_URL: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/** Lenient schema used during build or development when secrets aren't available. */
const lenientSchema = serverSchema.extend({
  AUTH_SECRET: z.string().default("mc-dev-secret-change-in-production"),
  POSTGRES_PRISMA_URL: z.string().default(""),
  POSTGRES_URL_NON_POOLING: z.string().default(""),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  CRON_SECRET: z.string().default(""),
  R2_PREFIX: z.string().default(""),
});

/**
 * During `next build`, NEXT_PHASE is set to "phase-production-build".
 * We skip strict validation in that phase since runtime secrets aren't available.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function validateEnv(): ServerEnv {
  // During build, skip strict validation entirely
  if (isBuildPhase) {
    return lenientSchema.parse(process.env);
  }

  // In production runtime, use strict schema and fail hard
  if (process.env.NODE_ENV === "production") {
    const prod = serverSchema.parse(process.env);
    // Fail fast at BOOT (not at first secret op) if the vault master key is missing/weak — otherwise the
    // secrets vault would run on the dev insecure default. secrets-crypto also throws at use time; this
    // surfaces it during startup. (Kept out of the zod schema so lenientSchema.extend() still works.)
    if ((prod.SECRET_ENCRYPTION_KEY ?? "").length < 32) {
      throw new Error("SECRET_ENCRYPTION_KEY must be set (>=32 chars) in production");
    }
    return prod;
  }

  // In development/test, try strict first and warn, then fall back to lenient
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const formatted = Object.entries(errors)
      .map(([key, msgs]) => `  ${key}: ${msgs?.join(", ")}`)
      .join("\n");

    console.error("\n❌ Invalid environment variables:\n" + formatted + "\n");
  }

  return lenientSchema.parse(process.env);
}

export const env = validateEnv();
