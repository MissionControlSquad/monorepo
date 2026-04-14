"use client";

import { useState, useRef, useEffect } from "react";
import { CircleHelp, MessageSquare, Lightbulb, Bug } from "lucide-react";
import { useSupportContext } from "./SupportContext";

export function SupportMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { openBugReport, openFeatureRequest, openLiveChat } = useSupportContext();

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function handle(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div className="relative group" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
          open
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
        aria-label="Support"
      >
        <CircleHelp className="w-[20px] h-[20px]" />
      </button>
      {!open && (
        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2 py-1 bg-foreground text-background text-xs font-medium rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-[200]">
          Support
        </span>
      )}

      {open && (
        <div className="absolute bottom-0 left-full ml-2 w-52 bg-background rounded-lg border border-border shadow-lg z-[100] py-1">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Support
            </p>
          </div>
          <div className="py-0.5">
            <button
              onClick={() => handle(openLiveChat)}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Talk to Us
            </button>
            <button
              onClick={() => handle(openFeatureRequest)}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Lightbulb className="w-4 h-4 text-muted-foreground" />
              Request a Feature
            </button>
            <button
              onClick={() => handle(openBugReport)}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Bug className="w-4 h-4 text-muted-foreground" />
              Report a Bug
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
