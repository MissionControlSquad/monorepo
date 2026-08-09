"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { PanelLeft, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { SIDEBAR_PREFERENCE_QUERY } from "@/lib/graphql/queries";
import { SET_SIDEBAR_PREFERENCE } from "@/lib/graphql/mutations";
import { Card, Button } from "@/components/ui";
import { NAV_ITEMS, orderNavItems, type NavItem } from "./IconRail";

// Paperclip parity (sidebar-preferences): let a user reorder and hide sidebar nav items. Saves the
// order + hidden hrefs; IconRail applies them. Lives on Settings.
export function SidebarCustomizeCard() {
  const [{ data }] = useQuery<{
    sidebarPreference: { orderedIds: string[]; hiddenIds: string[] };
  }>({ query: SIDEBAR_PREFERENCE_QUERY });
  const [, save] = useMutation(SET_SIDEBAR_PREFERENCE);
  const [items, setItems] = useState<NavItem[]>(NAV_ITEMS);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Seed local state from the saved preference once it loads.
  useEffect(() => {
    const pref = data?.sidebarPreference;
    if (!pref) return;
    // Order the FULL list (hidden included) so the panel can show + unhide them.
    setItems(orderNavItems(NAV_ITEMS, pref.orderedIds, []));
    setHidden(new Set(pref.hiddenIds));
  }, [data]);

  function move(index: number, dir: -1 | 1) {
    setItems((cur) => {
      const next = cur.slice();
      const j = index + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function toggleHidden(href: string) {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  async function onSave() {
    setSaving(true);
    try {
      const res = await save({
        orderedIds: items.map((it) => it.href),
        hiddenIds: [...hidden],
      });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to save");
      else toast.success("Sidebar updated");
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setSaving(true);
    try {
      await save({ orderedIds: [], hiddenIds: [] });
      setItems(NAV_ITEMS);
      setHidden(new Set());
      toast.success("Sidebar reset to default");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
          <PanelLeft className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Sidebar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reorder or hide the navigation items in your sidebar.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {items.map((it, i) => {
          const isHidden = hidden.has(it.href);
          return (
            <li key={it.href} className="flex items-center gap-2 py-2">
              <it.icon
                className={`h-4 w-4 shrink-0 ${isHidden ? "text-muted-foreground/50" : "text-muted-foreground"}`}
              />
              <span
                className={`flex-1 text-sm ${isHidden ? "text-muted-foreground line-through" : "text-foreground"}`}
              >
                {it.label}
              </span>
              <button
                className="rounded p-1 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="Move up"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                className="rounded p-1 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Move down"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                className="rounded p-1 text-muted-foreground transition hover:text-foreground"
                onClick={() => toggleHidden(it.href)}
                aria-label={isHidden ? "Show" : "Hide"}
              >
                {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button size="sm" variant="ghost" disabled={saving} onClick={onReset}>
          Reset
        </Button>
        <Button size="sm" disabled={saving} onClick={onSave}>
          Save
        </Button>
      </div>
    </Card>
  );
}
