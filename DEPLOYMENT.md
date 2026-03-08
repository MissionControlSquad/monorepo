# Mission Control — Deployment Guide

Step-by-step guide to deploy Mission Control on Vercel with Supabase (PostgreSQL) and Cloudflare R2.

---

## Prerequisites

- A GitHub account with this repository pushed
- Node.js 22+ installed locally
- `npm` available

---

## Step 1: Create a Vercel Account & Project

### Create Account

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Authorize Vercel to access your GitHub account

### Import Project

1. Click **Add New → Project**
2. Select the `mission-control` repository from your GitHub
3. Configure:
   - **Framework Preset** — Next.js (should auto-detect)
   - **Root Directory** — leave as `/` (or set if the repo is a monorepo)
   - **Build Command** — leave default (`next build`)
   - **Output Directory** — leave default
4. Click **Deploy** (this first deploy will fail without env vars — that's expected)

### Note Your Project Domain

After the project is created, note the default domain Vercel assigns (e.g. `mission-control-xyz.vercel.app`). You'll use this later or replace it with a custom domain.

### Get Vercel IDs

You need three values for GitHub Actions:

1. **VERCEL_TOKEN**:
   - Go to [vercel.com/account/tokens](https://vercel.com/account/tokens)
   - Click **Create Token**
   - Name it `github-actions`, set scope to your team/account
   - Copy the token

2. **VERCEL_ORG_ID**:
   - Go to your Vercel team/account **Settings → General**
   - Copy the **Team ID** (or Account ID for personal accounts)

3. **VERCEL_PROJECT_ID**:
   - Go to your project **Settings → General**
   - Copy the **Project ID**

---

## Step 2: Add Supabase Database (via Vercel Integration)

Vercel has a native Supabase integration that provisions a database and auto-injects connection strings as environment variables.

1. In your Vercel project, go to **Storage** tab
2. Click **Create Database** (or **Connect Store**)
3. Select **Supabase** (Postgres)
4. Click **Continue**
5. Choose a plan and region closest to your users
6. Click **Create** and wait for provisioning

Once complete, Vercel automatically adds these env vars to your project:

- `POSTGRES_PRISMA_URL` — pooled connection (with `?pgbouncer=true`)
- `POSTGRES_URL_NON_POOLING` — direct connection (for migrations)
- Plus other `POSTGRES_*` and `SUPABASE_*` variables

### Verify

1. Go to your Vercel project **Settings → Environment Variables**
2. Confirm `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` are present
3. Both should be available for the **Production** environment

---

## Step 3: Create Cloudflare R2 Bucket

### Create Account & Bucket

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up / log in
2. In the sidebar, click **R2 Object Storage**
3. Click **Create bucket**
4. Set **Bucket name** to `mnc` (or your preferred name)
5. Choose a location hint closest to your users
6. Click **Create bucket**

### Generate R2 API Credentials

1. Go to **R2 Object Storage → Overview**
2. Click **Manage R2 API Tokens** (top right)
3. Click **Create API token**
4. Configure:
   - **Token name** — e.g. `mission-control`
   - **Permissions** — Object Read & Write
   - **Specify bucket** — select your `mnc` bucket
5. Click **Create API Token**
6. Save the credentials shown:
   - `R2_ACCESS_KEY_ID` — the Access Key ID
   - `R2_SECRET_ACCESS_KEY` — the Secret Access Key
7. Note your **Account ID** from the R2 overview page URL or sidebar:
   - `R2_ACCOUNT_ID` — your Cloudflare account ID

---

## Step 4: Generate Secrets

Generate two random strings for auth and cron:

```bash
# AUTH_SECRET — used for signing JWT sessions (min 16 chars)
openssl rand -base64 32

# CRON_SECRET — used for authenticating cron job requests
openssl rand -base64 32
```

Save both values.

---

## Step 5: Add Remaining Environment Variables

The Supabase integration already added the database vars. Now add the rest.

1. Go to your Vercel project **Settings → Environment Variables**
2. Add these variables for the **Production** environment:

| Variable | Value | Source |
|----------|-------|--------|
| `AUTH_SECRET` | `<generated>` | Step 4 |
| `R2_ACCOUNT_ID` | `<from cloudflare>` | Step 3 |
| `R2_ACCESS_KEY_ID` | `<from cloudflare>` | Step 3 |
| `R2_SECRET_ACCESS_KEY` | `<from cloudflare>` | Step 3 |
| `R2_BUCKET_NAME` | `mnc` | Step 3 |
| `CRON_SECRET` | `<generated>` | Step 4 |
| `NEXT_PUBLIC_MC_URL` | `https://your-domain.com` | Your custom domain or Vercel URL |

3. Click **Save** for each variable

> Set `NEXT_PUBLIC_MC_URL` to your custom domain (e.g. `https://mc.yourdomain.com`) or the Vercel-assigned URL (e.g. `https://mission-control-xyz.vercel.app`). This is used by the app to generate absolute URLs.

### Full Environment Variables Checklist

Here's every env var that should be configured on Vercel for production:

| # | Variable | Value | How It's Added |
|---|----------|-------|----------------|
| 1 | `POSTGRES_PRISMA_URL` | `postgresql://...?pgbouncer=true` | Auto — Supabase integration (Step 2) |
| 2 | `POSTGRES_URL_NON_POOLING` | `postgresql://...` | Auto — Supabase integration (Step 2) |
| 3 | `AUTH_SECRET` | Random 32+ char string | Manual |
| 4 | `R2_ACCOUNT_ID` | Cloudflare account ID | Manual |
| 5 | `R2_ACCESS_KEY_ID` | R2 API key ID | Manual |
| 6 | `R2_SECRET_ACCESS_KEY` | R2 API secret | Manual |
| 7 | `R2_BUCKET_NAME` | `mnc` | Manual |
| 8 | `CRON_SECRET` | Random string | Manual |
| 9 | `NEXT_PUBLIC_MC_URL` | `https://your-domain.com` | Manual |

---

## Step 6: Configure GitHub Repository

### Add Secrets & Variables

Go to your GitHub repo **Settings → Secrets and variables → Actions**.

**Secrets** (New repository secret):

| Secret | Value |
|--------|-------|
| `VERCEL_TOKEN` | Your Vercel API token (from Step 1) |

**Variables** (New repository variable):

| Variable | Value |
|----------|-------|
| `VERCEL_ORG_ID` | Your Vercel Org/Team ID (from Step 1) |
| `VERCEL_PROJECT_ID` | Your Vercel Project ID (from Step 1) |

### Create a GitHub Environment

The workflow uses GitHub Environments to select deployment targets:

1. Go to repo **Settings → Environments**
2. Click **New environment**
3. Name it `production`
4. Optionally add protection rules:
   - **Required reviewers** — require approval before deploys
   - **Wait timer** — add a delay before deployment starts
5. Click **Save protection rules**

---

## Step 7: Deploy

### Via GitHub Actions (recommended)

1. Go to your repo on GitHub
2. Click **Actions** tab
3. Select **Deploy to Vercel** workflow
4. Click **Run workflow**
5. Select the `production` environment
6. Click **Run workflow**

The pipeline will:
1. Install dependencies (`npm ci` with cache)
2. Pull Vercel env vars
3. Generate Prisma client
4. Build the Next.js app
5. Run database migrations
6. Deploy prebuilt artifacts to Vercel

### Verify Deployment

Once the workflow completes:
1. Go to your Vercel dashboard
2. Click on the latest deployment
3. Visit the deployment URL to verify the app loads

---

## Step 8: Set Up Custom Domain

1. Go to your Vercel project **Settings → Domains**
2. Enter your domain (e.g. `mc.yourdomain.com`)
3. Click **Add**
4. Vercel will show DNS records to configure:
   - For apex domain (`yourdomain.com`): Add an **A** record pointing to `76.76.21.21`
   - For subdomain (`mc.yourdomain.com`): Add a **CNAME** record pointing to `cname.vercel-dns.com`
5. Add the DNS record at your domain registrar / DNS provider
6. Wait for DNS propagation (usually a few minutes)
7. Vercel will auto-provision an SSL certificate

### If Using Cloudflare DNS

If your domain DNS is managed by Cloudflare:
1. Add the CNAME record in Cloudflare DNS
2. Set the proxy status to **DNS only** (grey cloud) — Vercel handles SSL
3. Or keep **Proxied** (orange cloud) if you want Cloudflare's CDN in front

---

## Step 9: Set Up Cron Job (Auto-Sleep)

Mission Control has an auto-sleep endpoint to mark idle agents as sleeping. Set up a cron to call it periodically:

### Using Vercel Cron (vercel.json)

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/auto-sleep",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

The endpoint validates requests using `CRON_SECRET`.

### Using External Cron

Alternatively, use any cron service to hit:
```
POST https://your-domain.com/api/cron/auto-sleep
Authorization: Bearer <CRON_SECRET>
```

---

## Environment Variables Reference

| Variable | Required | Added By | Description |
|----------|----------|----------|-------------|
| `POSTGRES_PRISMA_URL` | Yes | Supabase integration | Pooled PostgreSQL connection (runtime) |
| `POSTGRES_URL_NON_POOLING` | Yes | Supabase integration | Direct PostgreSQL connection (migrations) |
| `AUTH_SECRET` | Yes | Manual | JWT session signing secret (min 16 chars) |
| `R2_ACCOUNT_ID` | Yes | Manual | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Yes | Manual | R2 API access key |
| `R2_SECRET_ACCESS_KEY` | Yes | Manual | R2 API secret key |
| `R2_BUCKET_NAME` | Yes | Manual | R2 bucket name (default: `mnc`) |
| `CRON_SECRET` | Yes | Manual | Cron endpoint auth secret |
| `NEXT_PUBLIC_MC_URL` | Yes | Manual | Public URL of Mission Control (custom domain or Vercel URL) |
| `VERCEL_URL` | No | Vercel (auto) | Auto-set by Vercel on deployments |

---

## Troubleshooting

**Build fails with Prisma errors?**
- Ensure `npx prisma generate` runs before `next build`
- Check that `POSTGRES_PRISMA_URL` is set in Vercel env vars

**Migrations fail?**
- The CI migration step sources env vars from `.vercel/.env.production.local` (pulled by `vercel pull`)
- Ensure `POSTGRES_URL_NON_POOLING` is set in Vercel env vars
- Try running migrations locally: `npx prisma migrate deploy`

**R2 uploads fail?**
- Verify `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` are correct
- Check the R2 API token has Object Read & Write permissions on the correct bucket
- Confirm `R2_BUCKET_NAME` matches the bucket you created

**Authentication not working?**
- `AUTH_SECRET` must be at least 16 characters
- If you change `AUTH_SECRET`, all existing sessions are invalidated

**Supabase integration env vars missing?**
- Go to Vercel **Storage** tab and verify the Supabase database is connected
- Check **Settings → Environment Variables** — `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` should be listed
- If missing, disconnect and reconnect the Supabase integration

**npm cache miss on first build?**
- Expected on the first run. The cache is saved after the build and used on subsequent runs.

**GitHub Actions workflow not visible?**
- The workflow uses `workflow_dispatch` — it only appears in the Actions tab after being pushed to the default branch
