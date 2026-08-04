import { describe, it, expect } from "vitest";
import {
  normalizeIds,
  getSidebarPreference,
  setSidebarPreference,
} from "../../src/server/services/sidebar-preferences";

// Paperclip parity — per-user sidebar order + hidden items.
describe("sidebar preferences", () => {
  it("normalizeIds trims, drops empties/non-strings, and dedupes preserving order", () => {
    expect(normalizeIds(["/a", " /b ", "/a", "", 3, "/c"])).toEqual(["/a", "/b", "/c"]);
    expect(normalizeIds(null)).toEqual([]);
    expect(normalizeIds("not-an-array")).toEqual([]);
  });

  it("defaults to empty arrays when a user has no saved preference", async () => {
    const pref = await getSidebarPreference("ws_pref_none", "user_none");
    expect(pref).toEqual({ orderedIds: [], hiddenIds: [] });
  });

  it("upserts and reads back a normalized preference", async () => {
    const WS = "ws_pref_test";
    const U = "user_pref_test";
    const saved = await setSidebarPreference(
      WS,
      U,
      ["/review", "/review", " /agents "],
      ["/cases"],
    );
    expect(saved.orderedIds).toEqual(["/review", "/agents"]);
    expect(saved.hiddenIds).toEqual(["/cases"]);

    const read = await getSidebarPreference(WS, U);
    expect(read).toEqual({ orderedIds: ["/review", "/agents"], hiddenIds: ["/cases"] });

    // Upsert overwrites in place (one row per workspace+user).
    const again = await setSidebarPreference(WS, U, ["/agents"], []);
    expect(again).toEqual({ orderedIds: ["/agents"], hiddenIds: [] });
    expect(await getSidebarPreference(WS, U)).toEqual({ orderedIds: ["/agents"], hiddenIds: [] });
  });
});
