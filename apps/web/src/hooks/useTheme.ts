"use client";

import { useCallback, useEffect, useState } from "react";

// Theme state (parity #25). Three choices: "light" | "dark" | "system". Persisted to localStorage
// under `theme`; the resolved value is applied as the `.dark` class on <html> (the pre-hydration
// script in the root layout applies it on first load to avoid a flash). "system" tracks the OS
// preference live.
export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const media = () =>
  typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function resolve(choice: ThemeChoice): boolean {
  if (choice === "dark") return true;
  if (choice === "light") return false;
  return media()?.matches ?? false;
}

function apply(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolve(choice));
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  // Hydrate from storage after mount (server render has no window).
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) ?? "system";
    setChoice(stored);
  }, []);

  // Keep <html> + storage in sync, and track OS changes while on "system".
  useEffect(() => {
    apply(choice);
    localStorage.setItem(STORAGE_KEY, choice);
    if (choice !== "system") return;
    const m = media();
    if (!m) return;
    const onChange = () => apply("system");
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [choice]);

  const setTheme = useCallback((next: ThemeChoice) => setChoice(next), []);
  return { theme: choice, setTheme, isDark: resolve(choice) };
}
