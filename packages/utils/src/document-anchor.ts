// Document annotation anchoring + cross-revision re-anchoring (parity Domain-8 §2.5 / G5, pure half). A
// comment thread is anchored to a text span by its quote plus a prefix/suffix context window and byte
// offsets. When the document is edited, the anchors must be re-mapped onto the new text; this is the
// PURE re-anchor (exact → context → fuzzy), returning a confidence. The DB threads/comments/locks live
// in the service. No I/O.

export interface AnchorSpec {
  quote: string; // the exact selected text at anchor time
  prefix: string; // a few chars immediately before the quote
  suffix: string; // a few chars immediately after the quote
  startOffset: number; // byte offset in the anchor-time text
  endOffset: number;
}

export interface ReanchorResult {
  startOffset: number;
  endOffset: number;
  quote: string;
  /** 1 = exact unique, ~0.9 = disambiguated by context, ~0.7 = recovered via context, lower = fuzzy. */
  confidence: number;
}

const CONTEXT = 32;

/** Build an AnchorSpec from a selection in `text`. */
export function makeAnchor(text: string, startOffset: number, endOffset: number): AnchorSpec {
  return {
    quote: text.slice(startOffset, endOffset),
    prefix: text.slice(Math.max(0, startOffset - CONTEXT), startOffset),
    suffix: text.slice(endOffset, endOffset + CONTEXT),
    startOffset,
    endOffset,
  };
}

function allIndicesOf(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

function contextScore(text: string, start: number, end: number, spec: AnchorSpec): number {
  const before = text.slice(Math.max(0, start - spec.prefix.length), start);
  const after = text.slice(end, end + spec.suffix.length);
  let score = 0;
  if (spec.prefix && before.endsWith(spec.prefix)) score += 0.5;
  if (spec.suffix && after.startsWith(spec.suffix)) score += 0.5;
  return score;
}

/**
 * Re-anchor a thread onto `newText`. Strategy, best-first:
 *  1. the quote occurs exactly once → exact (1.0)
 *  2. the quote occurs several times → pick the one whose prefix/suffix context matches (~0.9), else the
 *     one nearest the old offset (~0.6)
 *  3. the quote is gone but prefix+suffix still bracket a span → recover that span (~0.7)
 * Returns null when the anchor can't be located (the thread is orphaned).
 */
export function reanchor(newText: string, spec: AnchorSpec): ReanchorResult | null {
  const hits = allIndicesOf(newText, spec.quote);

  if (hits.length === 1) {
    const start = hits[0];
    return { startOffset: start, endOffset: start + spec.quote.length, quote: spec.quote, confidence: 1 };
  }

  if (hits.length > 1) {
    let best = hits[0];
    let bestScore = -1;
    for (const start of hits) {
      const end = start + spec.quote.length;
      const ctx = contextScore(newText, start, end, spec);
      // Prefer strong context; tie-break toward the closest old offset.
      const proximity = 1 - Math.min(1, Math.abs(start - spec.startOffset) / (newText.length || 1));
      const score = ctx * 2 + proximity;
      if (score > bestScore) {
        bestScore = score;
        best = start;
      }
    }
    const end = best + spec.quote.length;
    const ctx = contextScore(newText, best, end, spec);
    return {
      startOffset: best,
      endOffset: end,
      quote: spec.quote,
      confidence: ctx >= 1 ? 0.9 : ctx >= 0.5 ? 0.75 : 0.6,
    };
  }

  // Quote gone — try to recover the span bracketed by prefix…suffix.
  if (spec.prefix && spec.suffix) {
    const pIdx = newText.indexOf(spec.prefix);
    if (pIdx !== -1) {
      const spanStart = pIdx + spec.prefix.length;
      const sIdx = newText.indexOf(spec.suffix, spanStart);
      if (sIdx !== -1) {
        return {
          startOffset: spanStart,
          endOffset: sIdx,
          quote: newText.slice(spanStart, sIdx),
          confidence: 0.7,
        };
      }
    }
  }

  return null;
}

export interface ThreadAnchorInput {
  id: string;
  anchor: AnchorSpec;
}

export interface ThreadRemap {
  id: string;
  result: ReanchorResult | null; // null = orphaned
}

/** Re-anchor a set of open threads onto a new document revision. */
export function remapOpenThreadsForDocument(
  newText: string,
  threads: ThreadAnchorInput[],
): ThreadRemap[] {
  return threads.map((t) => ({ id: t.id, result: reanchor(newText, t.anchor) }));
}
