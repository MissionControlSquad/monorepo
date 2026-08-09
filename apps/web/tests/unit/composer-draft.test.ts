import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_DEBOUNCE_MS,
  DRAFT_KEY_PREFIX,
  clearDraft,
  draftKeyForTask,
  loadDraft,
  saveDraft,
} from "../../src/lib/composer-draft";

/** Minimal in-memory localStorage so the pure helpers can be exercised in Node. */
function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  vi.stubGlobal("localStorage", mock);
  return store;
}

describe("composer-draft helpers", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installMemoryStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("namespaces the draft key per task", () => {
    expect(draftKeyForTask("task-42")).toBe(`${DRAFT_KEY_PREFIX}task-42`);
    expect(draftKeyForTask("a")).not.toBe(draftKeyForTask("b"));
  });

  it("exposes a positive debounce interval", () => {
    expect(DRAFT_DEBOUNCE_MS).toBeGreaterThan(0);
  });

  it("saves and loads a draft by key", () => {
    const key = draftKeyForTask("task-1");
    saveDraft(key, "hello world");
    expect(store.get(key)).toBe("hello world");
    expect(loadDraft(key)).toBe("hello world");
  });

  it("returns an empty string when no draft is stored", () => {
    expect(loadDraft(draftKeyForTask("missing"))).toBe("");
  });

  it("removes the key for an empty or whitespace-only draft", () => {
    const key = draftKeyForTask("task-2");
    saveDraft(key, "typed something");
    expect(store.has(key)).toBe(true);

    saveDraft(key, "   \n  ");
    expect(store.has(key)).toBe(false);
    expect(loadDraft(key)).toBe("");
  });

  it("keeps drafts isolated between tasks", () => {
    const a = draftKeyForTask("task-a");
    const b = draftKeyForTask("task-b");
    saveDraft(a, "draft for a");
    saveDraft(b, "draft for b");

    expect(loadDraft(a)).toBe("draft for a");
    expect(loadDraft(b)).toBe("draft for b");

    clearDraft(a);
    expect(loadDraft(a)).toBe("");
    expect(loadDraft(b)).toBe("draft for b");
  });

  it("clears a stored draft", () => {
    const key = draftKeyForTask("task-3");
    saveDraft(key, "to be cleared");
    clearDraft(key);
    expect(store.has(key)).toBe(false);
    expect(loadDraft(key)).toBe("");
  });

  it("preserves surrounding whitespace of a non-empty draft", () => {
    const key = draftKeyForTask("task-4");
    saveDraft(key, "  padded body  ");
    expect(loadDraft(key)).toBe("  padded body  ");
  });

  it("never throws when localStorage is unavailable", () => {
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    vi.stubGlobal("localStorage", throwing);

    const key = draftKeyForTask("task-5");
    expect(() => saveDraft(key, "x")).not.toThrow();
    expect(() => clearDraft(key)).not.toThrow();
    expect(loadDraft(key)).toBe("");
  });
});
