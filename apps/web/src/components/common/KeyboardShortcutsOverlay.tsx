"use client";

import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? "\u2318" : "Ctrl";

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: [modKey, "K"], description: "Search tasks, messages, deliverables" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "H"], description: "Go to Home (Kanban board)" },
      { keys: ["G", "A"], description: "Go to Agents" },
      { keys: ["G", "P"], description: "Go to Projects" },
      { keys: ["G", "C"], description: "Go to Channels" },
      { keys: ["G", "S"], description: "Go to Settings" },
    ],
  },
  {
    title: "Task Detail",
    shortcuts: [
      { keys: ["\u2190"], description: "Previous task" },
      { keys: ["\u2192"], description: "Next task" },
      { keys: ["Esc"], description: "Close dialog" },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-muted border border-border text-xs font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setIsOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg p-0 gap-0 rounded-2xl" showCloseButton={false}>
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base font-semibold text-foreground">
            Keyboard Shortcuts
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Press <Kbd>?</Kbd> anywhere to toggle this overlay
          </p>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-0.5">
                          {i > 0 && <span className="text-xs text-muted-foreground mx-0.5">+</span>}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-border bg-muted rounded-b-2xl">
          <p className="text-xs text-muted-foreground text-center">
            Press <Kbd>Esc</Kbd> to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
