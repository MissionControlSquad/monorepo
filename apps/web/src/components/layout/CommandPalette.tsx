"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "urql";
import { Search, Plus, CornerDownLeft } from "lucide-react";
import { AGENTS_QUERY, PROJECTS_QUERY } from "@agentcenter/graphql-client/queries";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import { useFeatureFlags } from "../context/FeatureFlagContext";
import { NAV_ITEMS } from "./sidebar/IconRail";

// Paperclip parity (ui/src/components/CommandPalette.tsx): a Cmd/Ctrl-K quick switcher over nav pages,
// quick actions, agents and projects. Lightweight (no cmdk dep) — Dialog + filtered, keyboard-driven
// list. Mounted once in the app shell.
interface Cmd {
  id: string;
  label: string;
  group: string;
  run: () => void;
}

export function CommandPalette({ onCreateTask }: { onCreateTask: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const router = useRouter();
  const { isEnabled } = useFeatureFlags();
  const inputRef = useRef<HTMLInputElement>(null);

  const [{ data: agentData }] = useQuery<{ agents: { id: string; name: string }[] }>({
    query: AGENTS_QUERY,
    pause: !open,
  });
  const [{ data: projectData }] = useQuery<{ projects: { id: string; name: string }[] }>({
    query: PROJECTS_QUERY,
    pause: !open,
  });

  // Cmd/Ctrl-K toggles the palette from anywhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands: Cmd[] = useMemo(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const list: Cmd[] = [
      {
        id: "action:new-task",
        label: "New task",
        group: "Actions",
        run: () => {
          setOpen(false);
          onCreateTask();
        },
      },
      ...NAV_ITEMS.filter(({ flag }) => !flag || isEnabled(flag)).map((n) => ({
        id: `nav:${n.href}`,
        label: n.label,
        group: "Go to",
        run: go(n.href),
      })),
      ...(agentData?.agents ?? []).map((a) => ({
        id: `agent:${a.id}`,
        label: a.name,
        group: "Agents",
        run: go(`/agents/${a.id}`),
      })),
      ...(projectData?.projects ?? []).map((p) => ({
        id: `project:${p.id}`,
        label: p.name,
        group: "Projects",
        run: go(`/projects/${p.id}`),
      })),
    ];
    return list;
  }, [agentData, projectData, isEnabled, router, onCreateTask]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Preserve group order but flatten for keyboard navigation.
  const groups = useMemo(() => {
    const order = ["Actions", "Go to", "Agents", "Projects"];
    const byGroup = new Map<string, Cmd[]>();
    for (const c of filtered) {
      if (!byGroup.has(c.group)) byGroup.set(c.group, []);
      byGroup.get(c.group)!.push(c);
    }
    return order.filter((g) => byGroup.has(g)).map((g) => ({ group: g, items: byGroup.get(g)! }));
  }, [filtered]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[highlight]?.run();
    }
  }

  let flatIndex = -1;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, agents, projects…"
            className="w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">No matches.</p>
          )}
          {groups.map(({ group, items }) => (
            <div key={group} className="mb-1">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              {items.map((c) => {
                flatIndex += 1;
                const active = flatIndex === highlight;
                const idx = flatIndex;
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => c.run()}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      active ? "bg-muted text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {c.group === "Actions" ? (
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-0" />
                    )}
                    <span className="truncate">{c.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
