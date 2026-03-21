"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
  TEMPLATES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type WizardTemplate,
} from "@/lib/agent-wizard-templates";

interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: WizardTemplate) => void;
  excludeIds: string[];
}

export function AddAgentDialog({ open, onOpenChange, onSelect, excludeIds }: AddAgentDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = TEMPLATES.filter((t) => !excludeIds.includes(t.id));
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.role.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    if (selectedCategory) {
      result = result.filter((t) => t.category === selectedCategory);
    }
    return result;
  }, [search, selectedCategory, excludeIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, WizardTemplate[]>();
    for (const t of filtered) {
      const list = map.get(t.category) || [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [filtered]);

  const handleSelect = (template: WizardTemplate) => {
    onSelect(template);
    onOpenChange(false);
    setSearch("");
    setSelectedCategory(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="max-w-2xl p-0 gap-0 flex flex-col max-h-[80vh]">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-0">
          <DialogTitle className="text-base">Add an Agent</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg outline-none focus:border-indigo-500 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              !selectedCategory
                ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                : "bg-muted text-muted-foreground border border-border hover:border-border"
            }`}
          >
            All
          </button>
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                  : "bg-muted text-muted-foreground border border-border hover:border-border"
              }`}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No templates found</p>
          ) : (
            <div className="space-y-4">
              {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
                <div key={cat}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[cat] || cat}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grouped.get(cat)!.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSelect(t)}
                        className="text-left p-3 rounded-lg border border-border hover:border-indigo-500/50 hover:bg-muted/50 transition-all"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{t.emoji}</span>
                          <span className="font-medium text-sm text-foreground">{t.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {t.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {/* Show categories not in CATEGORY_ORDER */}
              {Array.from(grouped.keys())
                .filter((cat) => !CATEGORY_ORDER.includes(cat))
                .map((cat) => (
                  <div key={cat}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {CATEGORY_LABELS[cat] || cat}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {grouped.get(cat)!.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleSelect(t)}
                          className="text-left p-3 rounded-lg border border-border hover:border-indigo-500/50 hover:bg-muted/50 transition-all"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{t.emoji}</span>
                            <span className="font-medium text-sm text-foreground">{t.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {t.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
