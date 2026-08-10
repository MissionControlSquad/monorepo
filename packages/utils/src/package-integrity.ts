/**
 * Portable-package integrity + pinned import refs (Domain 14 — Paperclip agentcompanies/v1 parity).
 *
 * Pure + isomorphic (no `node:crypto`, so the client barrel stays bundle-safe): a compact SHA-256 over
 * UTF-8, a content-addressing digest over a package's file map (mirrors the skills-catalog contentHash),
 * and a parser/formatter for a GitHub-pinned `sourceRef` carrying an optional sha256 integrity hash.
 *
 * A `sourceRef` string encodes provenance the DB already stores in the `sourceRef` column of
 * AgentCompany / Team — no schema change: `github:<owner>/<repo>@<commit-or-ref>[#sha256:<64hex>]`.
 * Full remote fetch is deferred; the pinned-ref parsing + the sha256 integrity check are real and used
 * on import (a tampered package whose recomputed digest ≠ the pinned sha256 is rejected).
 */

// ─── SHA-256 (pure, dependency-free) ─────────────────────────────────────────
// Standard FIPS-180-4 SHA-256 over a UTF-8 string → 64-char lowercase hex. Kept local so `utils` has no
// `node:crypto` import (which would break the client bundle that imports FLAG_KEYS from this barrel).

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function utf8Bytes(str: string): Uint8Array {
  // TextEncoder is available in Node ≥11 and all browsers.
  return new TextEncoder().encode(str);
}

/** Pure: SHA-256 of a UTF-8 string, as 64-char lowercase hex. */
export function sha256Hex(input: string): string {
  const msg = utf8Bytes(input);
  const l = msg.length;
  const bitLen = l * 8;
  // padded length: message + 0x80 + zeros + 8-byte length, multiple of 64
  const withOne = l + 1;
  const k = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + k + 8;
  const buf = new Uint8Array(total);
  buf.set(msg, 0);
  buf[l] = 0x80;
  // 64-bit big-endian length (bitLen fits in 53 bits safely for our inputs)
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  buf[total - 8] = (hi >>> 24) & 0xff;
  buf[total - 7] = (hi >>> 16) & 0xff;
  buf[total - 6] = (hi >>> 8) & 0xff;
  buf[total - 5] = hi & 0xff;
  buf[total - 4] = (lo >>> 24) & 0xff;
  buf[total - 3] = (lo >>> 16) & 0xff;
  buf[total - 2] = (lo >>> 8) & 0xff;
  buf[total - 1] = lo & 0xff;

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
}

export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/**
 * Pure: content-addressing digest over a package file map. Sorts files by path, hashes each file's
 * content, and hashes the joined `${path}:${sha256(content)}` lines. Order-independent + reproducible —
 * the same set of files always yields the same digest (mirrors skills-catalog's per-entry contentHash).
 */
export function hashPackageFiles(files: { path: string; content: string }[]): string {
  const lines = files
    .map((f) => ({ path: f.path.trim(), sha: sha256Hex(f.content) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}:${f.sha}`);
  return sha256Hex(lines.join("\n"));
}

// ─── Pinned source refs ──────────────────────────────────────────────────────

export interface PinnedSourceRef {
  /** Only `github` is modelled today; remote fetch is deferred. */
  host: "github";
  /** `owner/repo`. */
  repo: string;
  /** A branch/tag name or a 40-hex commit (whichever was pinned). */
  ref: string;
  /** The 40-hex commit when the ref resolved to one, else null. */
  commit: string | null;
  /** Optional sha256 (64-hex) integrity hash over the imported package's files. */
  sha256: string | null;
}

const COMMIT_RE = /^[0-9a-f]{40}$/i;

/**
 * Pure: parse a pinned `sourceRef` string. Grammar:
 *   github:<owner>/<repo>@<commit-or-ref>[#sha256:<64hex>]
 * Returns null when the string is not a well-formed GitHub-pinned ref. When present, the sha256 must be
 * a valid 64-hex digest, otherwise the ref is rejected (returns null) — a malformed integrity hash is a
 * hard error, not silently dropped.
 */
export function parseSourceRef(input: string | null | undefined): PinnedSourceRef | null {
  if (!input) return null;
  const s = input.trim();
  const m = /^github:([^/\s]+)\/([^@\s#]+)@([^#\s]+)(?:#sha256:([^\s]+))?$/.exec(s);
  if (!m) return null;
  const [, owner, repo, atRef, sha] = m;
  if (!owner || !repo || !atRef) return null;
  if (sha !== undefined && !SHA256_HEX_RE.test(sha)) return null; // malformed integrity → reject
  const commit = COMMIT_RE.test(atRef) ? atRef.toLowerCase() : null;
  return {
    host: "github",
    repo: `${owner}/${repo}`,
    ref: atRef,
    commit,
    sha256: sha ? sha.toLowerCase() : null,
  };
}

/** Pure: format a PinnedSourceRef back into its canonical string (inverse of parseSourceRef). */
export function formatSourceRef(ref: PinnedSourceRef): string {
  const base = `${ref.host}:${ref.repo}@${ref.ref}`;
  return ref.sha256 ? `${base}#sha256:${ref.sha256}` : base;
}

export interface IntegrityResult {
  ok: boolean;
  /** The recomputed digest over the given files. */
  actual: string;
  /** The pinned digest we checked against (null when the ref carried no sha256). */
  expected: string | null;
}

/**
 * Pure: verify a package's files against the sha256 pinned in a `sourceRef`. When the ref carries no
 * sha256 there is nothing to verify → `ok: true`. When it does, `ok` is true only if the recomputed
 * `hashPackageFiles` digest matches — so a tampered file (any content change) is rejected.
 */
export function verifyPackageIntegrity(
  files: { path: string; content: string }[],
  sourceRef: string | PinnedSourceRef | null | undefined,
): IntegrityResult {
  const ref = typeof sourceRef === "string" ? parseSourceRef(sourceRef) : (sourceRef ?? null);
  const actual = hashPackageFiles(files);
  const expected = ref?.sha256 ?? null;
  return { ok: expected === null || expected === actual, actual, expected };
}
