# AgentCenter Bridge — Internal Development Guide

Internal reference for building, testing, and publishing the `@agentcenter/agentcenter-bridge` ClawHub plugin.

---

## Prerequisites

- Node.js 22+ (see `.nvmrc` in repo root)
- npm 10+
- clawhub CLI (installed via `npm run clawhub:setup`)
- ClawHub account logged in as `@JagodanaDharmendra` with access to the `agentcenter` org

---

## Project structure

```
packages/mc-bridge-plugin/
├── src/
│   ├── index.ts            # Plugin entry point — registers the service lifecycle
│   ├── ws-client.ts        # Persistent WebSocket client (connect, auth, reconnect, ping)
│   ├── agent-reporter.ts   # Subscribes to OpenClaw events, forwards to MC via WS
│   ├── openclaw-local.ts   # Thin wrapper over OpenClaw runtime globals
│   └── config-schema.ts    # TypeScript interface for plugin config
├── dist/
│   └── index.js            # Bundled output (esbuild) — what gets published
├── config-schema.json      # JSON Schema for OpenClaw config UI
├── config-schema.js        # JS version of schema (used internally)
├── openclaw.plugin.json    # Plugin metadata (id, name, version, clawhub slug)
├── package.json            # npm manifest + all scripts
├── LICENSE                 # MIT
├── README.md               # Public-facing (shown on ClawHub)
└── DEVELOPMENT.md          # This file — internal only
```

---

## Daily development

### Use correct Node version
```bash
nvm use
```

### Build
```bash
npm run build
```
Bundles `src/index.ts` → `dist/index.js` via esbuild (~133kb, ESM).

### Type check
```bash
npm run typecheck
```

### Preview package contents (no upload)
```bash
npm run clawhub:dry
```
Runs build + `npm pack --dry-run` — shows exactly which files will be included.

### Build fallback `.tgz` for web app
```bash
npm run pack
```
Outputs `agentcenter-agentcenter-bridge-0.x.x.tgz` into `apps/web/public/`.
Served at `/api/live-gateway/plugin.tgz` as a fallback install method.

---

## Publishing to ClawHub

### First-time machine setup
```bash
npm run clawhub:setup
```
Installs clawhub CLI globally and opens browser to authenticate via GitHub.

### Publish current version
```bash
npm run clawhub:publish
```
Runs: `typecheck → build → clawhub package publish`

Full flags used:
```
clawhub package publish .
  --family code-plugin
  --name @agentcenter/agentcenter-bridge
  --display-name "AgentCenter Bridge"
  --source-repo MissionControlSquad/monorepo
  --source-commit <current git SHA>
  --source-path packages/mc-bridge-plugin
```

---

## Releasing a new version

### When to bump which version

| Change type | Command | Example |
|---|---|---|
| Bug fix, no behaviour change | `release:patch` | `0.1.0 → 0.1.1` |
| New feature, existing config still works | `release:minor` | `0.1.0 → 0.2.0` |
| Renamed/removed config field, protocol change | `release:major` | `0.1.0 → 1.0.0` |

### Step-by-step release process

**1. Make sure you're on `main` and up to date**
```bash
git checkout main
git pull origin main
```

**2. Make your code changes in a feature branch, get them merged to `main` first**
```bash
git checkout -b fix/my-change
# ... make changes ...
git push origin fix/my-change
# open PR → merge to main
git checkout main && git pull
```

**3. Verify everything passes before releasing**
```bash
cd packages/mc-bridge-plugin
nvm use
npm run typecheck
npm run build
npm run clawhub:dry   # confirm correct files are included
```

**4. Run the release command**
```bash
# Pick one based on the change type above
npm run release:patch
npm run release:minor
npm run release:major
```

Each command does the following automatically:
1. `npm version <patch|minor|major>` — bumps version in `package.json`, creates a git tag
2. `npm run version:sync` — writes the new version into `openclaw.plugin.json`
3. `npm run clawhub:publish` — typechecks, builds, and publishes to ClawHub

**5. Push the version bump commit and tag**
```bash
git push origin main --follow-tags
```

**6. Verify on ClawHub**

Go to `clawhub.ai/@agentcenter/agentcenter-bridge` and confirm:
- New version appears in the version list
- `latest` tag points to the new version
- README and config schema look correct

---

### Changelog / release notes

Use the `--changelog` flag if you want release notes visible on the ClawHub listing.
Currently the `clawhub:publish` script does not include it — to add notes for a specific release, run manually:

```bash
npm run build && clawhub package publish . \
  --family code-plugin \
  --name @agentcenter/agentcenter-bridge \
  --display-name "AgentCenter Bridge" \
  --source-repo MissionControlSquad/monorepo \
  --source-commit $(git rev-parse HEAD) \
  --source-path packages/mc-bridge-plugin \
  --changelog "What changed in this release"
```

---

### Manual version sync (if versions get out of sync)
```bash
npm run version:sync
```
Reads version from `package.json` and writes it into `openclaw.plugin.json`. Run this if you ever manually edit one without the other.

---

### Pinning a specific version tag on ClawHub

By default, every publish moves the `latest` tag to the new version. To publish under a custom tag (e.g. `beta`) without moving `latest`:

```bash
clawhub package publish . \
  --family code-plugin \
  --name @agentcenter/agentcenter-bridge \
  --source-commit $(git rev-parse HEAD) \
  --tags beta
```

Users can then install a specific version or tag:
```bash
# Specific version
openclaw plugins install clawhub:@agentcenter/agentcenter-bridge@0.2.0

# Beta tag
openclaw plugins install clawhub:@agentcenter/agentcenter-bridge@beta
```

---

## Required `openclaw` fields in `package.json`

ClawHub validates these on publish — do not remove:

```json
"openclaw": {
  "extensions": ["./dist/index.js"],
  "compat": {
    "pluginApi": ">=1.0.0"
  },
  "build": {
    "openclawVersion": "1.0.0"
  }
}
```

---

## Plugin config fields (user-facing)

| Field | Type | Required | Default |
|---|---|---|---|
| `agentCenterUrl` | string | Yes | — |
| `token` | string | Yes | — |
| `fingerprint` | string | No | auto (hostname + MAC SHA256) |
| `reconnectBaseMs` | number | No | 2000 |
| `reconnectMaxMs` | number | No | 30000 |

---

## ClawHub details

| Item | Value |
|---|---|
| Package name | `@agentcenter/agentcenter-bridge` |
| ClawHub slug | `@agentcenter/agentcenter-bridge` |
| Install command | `openclaw plugins install clawhub:@agentcenter/agentcenter-bridge` |
| Account | `@JagodanaDharmendra` |
| Org | `agentcenter` |
| Family | `code-plugin` |
| Source repo | `MissionControlSquad/monorepo` |
| Source path | `packages/mc-bridge-plugin` |
