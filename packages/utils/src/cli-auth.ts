/**
 * CLI device-auth user-code helpers (Epic #12) — shared across apps. Import from @agentcenter/utils.
 * Pure. The short code a user types to approve a CLI login; unambiguous alphabet (no O/0/I/1/L).
 */

export const CLI_USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CLI_USER_CODE_LENGTH = 8; // shown grouped as XXXX-XXXX

/** Pure: strip formatting → the canonical stored form (uppercase, alphanumerics only). */
export function normalizeUserCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Pure: present a normalized code grouped for readability (ABCD-2345). */
export function formatUserCode(code: string): string {
  const n = normalizeUserCode(code);
  return n.length > 4 ? `${n.slice(0, 4)}-${n.slice(4)}` : n;
}

/** Pure: shape check — right length and only alphabet characters. */
export function isValidUserCode(raw: string): boolean {
  const n = normalizeUserCode(raw);
  if (n.length !== CLI_USER_CODE_LENGTH) return false;
  for (const ch of n) if (!CLI_USER_CODE_ALPHABET.includes(ch)) return false;
  return true;
}
