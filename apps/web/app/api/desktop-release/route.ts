import { NextResponse } from "next/server";

// ── Config ─────────────────────────────────────────────────────────────────
// Set RELEASES_BASE_URL in your deployment env (no trailing slash).
// e.g. https://releases.agentcenter.cloud/desktop
//
// When set, release info is read from the public S3/CDN manifests (works for
// private repos — no GitHub token required, no rate limits).
//
// When absent, falls back to the GitHub Releases API (requires
// GITHUB_TOKEN env var for private repos; rate-limited to 60 req/hr otherwise).
const RELEASES_BASE_URL = process.env.RELEASES_BASE_URL?.replace(/\/$/, "");
const GITHUB_REPO = "MissionControlSquad/monorepo";

interface DesktopRelease {
  version: string;
  name: string;
  publishedAt: string;
  releaseUrl: string;
  assets: {
    mac?: { url: string; size: number };
    win?: { url: string; size: number };
    linux?: { url: string; size: number };
  };
}

// Cached for 5 minutes
export const revalidate = 300;

// ── Minimal YAML field reader ───────────────────────────────────────────────
// electron-updater manifests are simple flat YAML — no need for a full parser.
// Handles: `key: value` lines and the first `- url:` / `- size:` list entry.
function readYamlField(text: string, field: string): string {
  const match = new RegExp(`^${field}:\\s*(.+)$`, "m").exec(text);
  return match ? match[1].trim() : "";
}
function readYamlListField(text: string, field: string): string {
  // Matches the first occurrence of `  - field: value` (indented list item)
  const match = new RegExp(`^\\s+-\\s+${field}:\\s*(.+)$`, "m").exec(text);
  return match ? match[1].trim() : "";
}

// ── S3/CDN path ────────────────────────────────────────────────────────────
// Reads the three electron-updater manifests (latest-mac.yml, latest.yml,
// latest-linux.yml) that electron-builder uploads alongside the installers.
//
// Manifest format (YAML):
//   version: 1.2.3
//   files:
//     - url: AgentCenter-1.2.3.dmg
//       size: 123456789
//   releaseDate: 2025-01-01T00:00:00.000Z
async function fromS3(base: string): Promise<DesktopRelease> {
  const manifests = [
    { key: "mac", file: "latest-mac.yml" },
    { key: "win", file: "latest.yml" },
    { key: "linux", file: "latest-linux.yml" },
  ] as const;

  const results = await Promise.allSettled(
    manifests.map(async ({ key, file }) => {
      const res = await fetch(`${base}/${file}`, {
        next: { revalidate: 300 },
      });
      if (!res.ok) throw new Error(`${file} not found`);
      const text = await res.text();
      const version = readYamlField(text, "version");
      const filename = readYamlListField(text, "url");
      const size = parseInt(readYamlListField(text, "size") || "0", 10);
      const releaseDate = readYamlField(text, "releaseDate");
      return {
        key,
        version,
        url: `${base}/${filename}`,
        size,
        releaseDate,
      };
    }),
  );

  const assets: DesktopRelease["assets"] = {};
  let version = "";
  let releaseDate = "";

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { key, url, size } = result.value;
      assets[key] = { url, size };
      if (!version) version = result.value.version;
      if (!releaseDate) releaseDate = result.value.releaseDate;
    }
  }

  if (!version) throw new Error("No manifests found in S3");

  return {
    version,
    name: `AgentCenter v${version}`,
    publishedAt: releaseDate,
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/desktop-v${version}`,
    assets,
  };
}

// ── GitHub Releases fallback ───────────────────────────────────────────────
// Used when RELEASES_BASE_URL is not configured (e.g. public repos or dev).
interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}
interface GitHubRelease {
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  html_url: string;
  assets: GitHubAsset[];
}

async function fromGitHub(): Promise<DesktopRelease> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
    headers,
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error("GitHub API error");

  const releases: GitHubRelease[] = await res.json();
  const latest = releases.find(
    (r) => !r.draft && !r.prerelease && r.tag_name.startsWith("desktop-v"),
  );
  if (!latest) throw new Error("No desktop release found");

  const find = (ext: string) =>
    latest.assets.find(
      (a) =>
        a.name.toLowerCase().endsWith(ext) &&
        !a.name.includes("blockmap") &&
        !a.name.includes("latest"),
    );

  const macA = find(".dmg");
  const winA = find(".exe");
  const linuxA = find(".appimage");

  return {
    version: latest.tag_name.replace(/^desktop-v/, ""),
    name: latest.name,
    publishedAt: latest.published_at,
    releaseUrl: latest.html_url,
    assets: {
      ...(macA && { mac: { url: macA.browser_download_url, size: macA.size } }),
      ...(winA && { win: { url: winA.browser_download_url, size: winA.size } }),
      ...(linuxA && { linux: { url: linuxA.browser_download_url, size: linuxA.size } }),
    },
  };
}

// ── Handler ────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const release = RELEASES_BASE_URL ? await fromS3(RELEASES_BASE_URL) : await fromGitHub();

    return NextResponse.json(release);
  } catch (err) {
    console.error("[desktop-release]", err);
    return NextResponse.json({ error: "Could not load release info" }, { status: 502 });
  }
}
