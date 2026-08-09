import { describe, it, expect } from "vitest";
import { DeliveryDedup, shouldForceReconnect, type DedupFs } from "../src/delivery-dedup";

// An in-memory fake fs so persistence is testable without touching disk.
function fakeFs(): DedupFs & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    existsSync: (p) => store.has(p),
    readFileSync: (p) => store.get(p) ?? "",
    writeFileSync: (p, d) => void store.set(p, d),
    mkdirSync: () => {},
  };
}

describe("DeliveryDedup", () => {
  it("runs a deliveryId once and recognises repeats", () => {
    const d = new DeliveryDedup(500);
    expect(d.has("x")).toBe(false);
    d.add("x");
    expect(d.has("x")).toBe(true);
    d.add("x"); // idempotent
    expect(d.size).toBe(1);
  });

  it("FIFO-evicts past the cap", () => {
    const d = new DeliveryDedup(2);
    d.add("a");
    d.add("b");
    d.add("c"); // evicts "a"
    expect(d.has("a")).toBe(false);
    expect(d.has("b")).toBe(true);
    expect(d.has("c")).toBe(true);
    expect(d.size).toBe(2);
  });

  it("persists across instances (survives a plugin restart)", () => {
    const fs = fakeFs();
    const path = "/state/dedup.json";
    const first = new DeliveryDedup(500, path, fs);
    first.add("delivery-1");
    first.add("delivery-2");

    // Simulate a restart: a brand-new instance reads the same state file.
    const afterRestart = new DeliveryDedup(500, path, fs);
    expect(afterRestart.has("delivery-1")).toBe(true);
    expect(afterRestart.has("delivery-2")).toBe(true);
    // A redelivered task is NOT re-run after restart.
    expect(afterRestart.has("delivery-1")).toBe(true);
  });

  it("survives a corrupt state file (starts fresh, no crash)", () => {
    const fs = fakeFs();
    const path = "/state/dedup.json";
    fs.store.set(path, "{not json");
    const d = new DeliveryDedup(500, path, fs);
    expect(d.size).toBe(0);
    expect(() => d.add("y")).not.toThrow();
  });

  it("only keeps the last `limit` ids when reloading a large file", () => {
    const fs = fakeFs();
    const path = "/state/dedup.json";
    fs.store.set(path, JSON.stringify(["a", "b", "c", "d"]));
    const d = new DeliveryDedup(2, path, fs);
    expect(d.has("a")).toBe(false);
    expect(d.has("c")).toBe(true);
    expect(d.has("d")).toBe(true);
  });
});

describe("shouldForceReconnect", () => {
  it("triggers only at/after the max-missed threshold", () => {
    expect(shouldForceReconnect(0, 2)).toBe(false);
    expect(shouldForceReconnect(1, 2)).toBe(false);
    expect(shouldForceReconnect(2, 2)).toBe(true);
    expect(shouldForceReconnect(3, 2)).toBe(true);
  });
});
