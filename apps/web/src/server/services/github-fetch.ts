import { guardedFetch } from "@agentcenter/utils/remote-http-endpoint-guard";

// GitHub fetch (parity #66). A thin, SSRF-guarded client for the public GitHub REST API. Works without
// a token for public resources (subject to GitHub's low anonymous rate limit); a GITHUB_TOKEN in the
// env raises the limit and unlocks private objects the token can see. All egress goes through
// guardedFetch so a crafted ref can't be used to reach internal hosts.

const GITHUB_API = "https://api.github.com";

export type GithubFetcher = (apiPath: string) => Promise<GithubFetchResult>;

export interface GithubFetchResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown> | null;
  error?: string;
}

/** Fetch a GitHub API path (no leading slash), e.g. "repos/owner/repo/issues/1". */
export async function githubApiFetch(apiPath: string): Promise<GithubFetchResult> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agent-center-cloud",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await guardedFetch(`${GITHUB_API}/${apiPath.replace(/^\/+/, "")}`, { headers });
  } catch (err) {
    return { ok: false, status: 0, payload: null, error: (err as Error).message };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      payload: null,
      error:
        res.status === 403
          ? "GitHub rate limit or access denied (set GITHUB_TOKEN to raise limits)"
          : `GitHub returned ${res.status}`,
    };
  }
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: true, status: res.status, payload };
}
