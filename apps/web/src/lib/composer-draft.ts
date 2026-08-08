/**
 * Per-task composer draft persistence for the task chat / comments composer.
 *
 * Draft text is kept in localStorage under a task-scoped key so an unsent
 * message survives navigation away and a page refresh. All access is guarded
 * so a disabled or full store never throws into React. Empty drafts remove
 * the key, and only the text body is persisted (attachments and other
 * ephemeral state stay in session).
 *
 * The functions here are intentionally free of any React coupling so they can
 * be unit-tested in isolation. The React glue lives in `useComposerDraft`.
 */

/** localStorage namespace for composer drafts. */
export const DRAFT_KEY_PREFIX = "mc:composer-draft:";

/** Debounce before a keystroke lands in localStorage. */
export const DRAFT_DEBOUNCE_MS = 800;

/** Build the task-scoped storage key for a draft. */
export function draftKeyForTask(taskId: string): string {
  return `${DRAFT_KEY_PREFIX}${taskId}`;
}

/** Read the saved draft text for a key, or "" if none / storage unavailable. */
export function loadDraft(draftKey: string): string {
  try {
    return localStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}

/**
 * Persist a draft. A blank (whitespace-only) value removes the key so an
 * emptied composer does not leave a stale draft behind.
 */
export function saveDraft(draftKey: string, value: string): void {
  try {
    if (value.trim()) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore localStorage failures (private mode, quota, disabled).
  }
}

/** Remove a saved draft (called after a successful send). */
export function clearDraft(draftKey: string): void {
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // Ignore localStorage failures.
  }
}
