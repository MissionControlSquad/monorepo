import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DRAFT_DEBOUNCE_MS,
  clearDraft as clearStoredDraft,
  draftKeyForTask,
  loadDraft,
  saveDraft,
} from "./composer-draft";

export interface UseComposerDraft {
  /** Current composer text, seeded from any persisted draft. */
  value: string;
  /** Update the composer text (debounced-persisted under the task key). */
  setValue: (value: string) => void;
  /** True once a non-empty draft is persisted, for the "Draft saved" hint. */
  draftSaved: boolean;
  /** Drop the persisted draft and reset the composer (call after a send). */
  clear: () => void;
}

/**
 * React glue over the pure {@link composer-draft} helpers. Owns the composer's
 * text so an unsent message is restored on mount, persisted (debounced) while
 * typing, flushed on unmount / page unload, and cleared after a successful
 * send. Drafts are keyed per task, so text never crosses task boundaries.
 */
export function useComposerDraft(taskId: string): UseComposerDraft {
  const draftKey = useMemo(() => draftKeyForTask(taskId), [taskId]);
  const [value, setValue] = useState<string>(() => loadDraft(draftKey));
  const [draftSaved, setDraftSaved] = useState<boolean>(() => Boolean(loadDraft(draftKey).trim()));

  const valueRef = useRef(value);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Restore (or reset) when the active task changes.
  useEffect(() => {
    const restored = loadDraft(draftKey);
    setValue(restored);
    setDraftSaved(Boolean(restored.trim()));
  }, [draftKey]);

  // Debounced persistence while typing.
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftKey, valueRef.current);
      setDraftSaved(Boolean(valueRef.current.trim()));
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [value, draftKey]);

  // Flush any pending text on unmount so a fast navigation never loses it.
  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      saveDraft(draftKey, valueRef.current);
    };
  }, [draftKey]);

  // Flush before a full page reload / close.
  useEffect(() => {
    const flush = () => saveDraft(draftKey, valueRef.current);
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [draftKey]);

  const clear = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    clearStoredDraft(draftKey);
    valueRef.current = "";
    setValue("");
    setDraftSaved(false);
  }, [draftKey]);

  return { value, setValue, draftSaved, clear };
}
