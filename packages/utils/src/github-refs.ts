// GitHub reference parsing (parity #65/#66, pure half). Turn a user-supplied GitHub reference — a URL,
// an `owner/repo#123`, or `owner/repo` — into a normalized descriptor plus the api.github.com path to
// fetch it. PURE, no I/O, client-safe (no node:dns), so it is unit-testable and reusable. The actual
// SSRF-guarded fetch lives server-side in github-fetch.

export type GithubObjectType = "repo" | "issue" | "pull" | "commit" | "file";

export interface GithubRef {
  objectType: GithubObjectType;
  owner: string;
  repo: string;
  /** issue/pull number, commit sha, or file path — depending on objectType. */
  ref?: string;
  /** Canonical external id, e.g. "owner/repo#123" or "owner/repo@sha" or "owner/repo". */
  externalId: string;
  /** api.github.com path (no leading slash) to fetch this object. */
  apiPath: string;
  /** Human URL. */
  htmlUrl: string;
}

export class GithubRefError extends Error {}

const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const REPO = "[A-Za-z0-9._-]+";

function build(
  objectType: GithubObjectType,
  owner: string,
  repo: string,
  ref: string | undefined,
  externalId: string,
  apiPath: string,
  htmlUrl: string,
): GithubRef {
  return { objectType, owner, repo, ref, externalId, apiPath, htmlUrl };
}

/**
 * Parse a GitHub reference. Accepts:
 *  - `https://github.com/owner/repo` (repo)
 *  - `https://github.com/owner/repo/issues/123` (issue) / `/pull/123` (pull)
 *  - `https://github.com/owner/repo/commit/<sha>` (commit)
 *  - `https://github.com/owner/repo/blob/<ref>/<path>` (file)
 *  - `owner/repo#123` (issue by default), `owner/repo@<sha>` (commit), `owner/repo` (repo)
 */
export function parseGithubRef(input: string): GithubRef {
  const raw = (input ?? "").trim();
  if (!raw) throw new GithubRefError("empty reference");

  // URL forms
  const urlMatch = raw.match(/^https?:\/\/github\.com\/(.+)$/i);
  if (urlMatch) {
    const parts = urlMatch[1].replace(/\/+$/, "").split("/");
    const [owner, repo, kind, ...rest] = parts;
    if (!owner || !repo) throw new GithubRefError("URL missing owner/repo");
    const base = `${owner}/${repo}`;
    if (!kind) return build("repo", owner, repo, undefined, base, `repos/${base}`, `https://github.com/${base}`);
    if (kind === "issues" && rest[0])
      return build("issue", owner, repo, rest[0], `${base}#${rest[0]}`, `repos/${base}/issues/${rest[0]}`, raw);
    if (kind === "pull" && rest[0])
      return build("pull", owner, repo, rest[0], `${base}#${rest[0]}`, `repos/${base}/pulls/${rest[0]}`, raw);
    if (kind === "commit" && rest[0])
      return build("commit", owner, repo, rest[0], `${base}@${rest[0]}`, `repos/${base}/commits/${rest[0]}`, raw);
    if (kind === "blob" && rest.length >= 2) {
      const [gitRef, ...pathParts] = rest;
      const path = pathParts.join("/");
      return build("file", owner, repo, path, `${base}:${gitRef}:${path}`, `repos/${base}/contents/${path}?ref=${gitRef}`, raw);
    }
    throw new GithubRefError(`unsupported GitHub URL shape: ${raw}`);
  }

  // Shorthand forms
  const issueMatch = raw.match(new RegExp(`^(${OWNER})/(${REPO})#(\\d+)$`));
  if (issueMatch) {
    const [, owner, repo, num] = issueMatch;
    const base = `${owner}/${repo}`;
    return build("issue", owner, repo, num, `${base}#${num}`, `repos/${base}/issues/${num}`, `https://github.com/${base}/issues/${num}`);
  }
  const commitMatch = raw.match(new RegExp(`^(${OWNER})/(${REPO})@([0-9a-f]{7,40})$`, "i"));
  if (commitMatch) {
    const [, owner, repo, sha] = commitMatch;
    const base = `${owner}/${repo}`;
    return build("commit", owner, repo, sha, `${base}@${sha}`, `repos/${base}/commits/${sha}`, `https://github.com/${base}/commit/${sha}`);
  }
  const repoMatch = raw.match(new RegExp(`^(${OWNER})/(${REPO})$`));
  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    const base = `${owner}/${repo}`;
    return build("repo", owner, repo, undefined, base, `repos/${base}`, `https://github.com/${base}`);
  }

  throw new GithubRefError(`unrecognized GitHub reference: ${raw}`);
}

/** Extract the display fields we cache from a raw GitHub API payload, by object type. */
export function summarizeGithubPayload(
  objectType: GithubObjectType,
  payload: Record<string, unknown>,
): { title?: string; state?: string } {
  switch (objectType) {
    case "issue":
    case "pull":
      return { title: payload.title as string | undefined, state: payload.state as string | undefined };
    case "repo":
      return {
        title: (payload.full_name as string) ?? (payload.name as string | undefined),
        state: payload.archived ? "archived" : "active",
      };
    case "commit": {
      const commit = payload.commit as { message?: string } | undefined;
      return { title: commit?.message?.split("\n")[0] };
    }
    case "file":
      return { title: payload.name as string | undefined };
    default:
      return {};
  }
}
