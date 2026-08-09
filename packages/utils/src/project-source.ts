/**
 * Project source-configuration vocabulary (Paperclip Project Workspace parity) — shared across all
 * apps. Import from @agentcenter/utils. Pure constants + guards; do NOT duplicate these as string
 * literals. The runtime that actually checks out a repo is separate — these only describe intent.
 */

export const PROJECT_SOURCE_TYPE = {
  LOCAL_GIT: "local_git",
  NON_GIT: "non_git",
  REMOTE_REPO: "remote_repo",
  REMOTE_MANAGED: "remote_managed",
} as const;
export const PROJECT_SOURCE_TYPES = Object.values(PROJECT_SOURCE_TYPE);
export type ProjectSourceType = (typeof PROJECT_SOURCE_TYPES)[number];

export const PROJECT_VISIBILITY = {
  PRIVATE: "private",
  WORKSPACE: "workspace",
} as const;
export const PROJECT_VISIBILITIES = Object.values(PROJECT_VISIBILITY);
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

export function isProjectSourceType(v: string): v is ProjectSourceType {
  return (PROJECT_SOURCE_TYPES as readonly string[]).includes(v);
}
export function isProjectVisibility(v: string): v is ProjectVisibility {
  return (PROJECT_VISIBILITIES as readonly string[]).includes(v);
}

/** Only remote_repo carries a repo URL/ref; the others must not (keeps the record coherent). */
export function sourceTypeUsesRepo(sourceType: string | null | undefined): boolean {
  return sourceType === PROJECT_SOURCE_TYPE.REMOTE_REPO;
}
