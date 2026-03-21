"use client";

import { useState, useMemo } from "react";
import { Search, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/shadcn/sheet";
import {
  TEMPLATES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type WizardTemplate,
} from "@/lib/agent-wizard-templates";
import { getAgentName } from "@/lib/agent-default-names";

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
    toast.success(`${getAgentName(template.id, template.name)} added to team`);
  };

  const allCategories = [
    ...CATEGORY_ORDER.filter((cat) => grouped.has(cat)),
    ...Array.from(grouped.keys()).filter((cat) => !CATEGORY_ORDER.includes(cat)),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-base">Add an Agent</SheetTitle>
          <SheetDescription>Browse {TEMPLATES.length} agent templates</SheetDescription>
        </SheetHeader>

        {/* Search */}
        <div className="shrink-0 px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role, or description..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-muted border border-border rounded-lg outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category pills */}
        <div className="shrink-0 px-4 pb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              !selectedCategory
                ? "bg-primary/10 text-primary border border-primary/30"
                : "bg-muted text-muted-foreground border border-border"
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
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-2">No templates found</p>
              {(search || selectedCategory) && (
                <button
                  onClick={() => {
                    setSearch("");
                    setSelectedCategory(null);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {allCategories.map((cat) => (
                <div key={cat}>
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[cat] || cat}
                  </h4>
                  <div className="space-y-1.5">
                    {grouped.get(cat)!.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSelect(t)}
                        className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition-all group flex items-start gap-3"
                      >
                        <span className="text-xl shrink-0 mt-0.5">{t.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                              {getAgentName(t.id, t.name)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{t.role}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {t.description}
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {excludeIds.length} agent{excludeIds.length !== 1 ? "s" : ""} in team
          </span>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            Done
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
