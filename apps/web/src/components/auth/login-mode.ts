// Pure decision for the login screen: when buildbase is configured (a non-empty
// NEXT_PUBLIC_SAAS_ORG_ID is baked into the client bundle), buildbase SSO is the primary login and
// the admin form is a secondary break-glass; otherwise only the admin form renders. Extracted so the
// gating is unit-testable without a DOM (the login page has no test-stack DOM environment).

export type LoginMode = "buildbase" | "operator-only";

export function resolveLoginMode(orgId: string | null | undefined): LoginMode {
  return orgId && orgId.trim().length > 0 ? "buildbase" : "operator-only";
}
