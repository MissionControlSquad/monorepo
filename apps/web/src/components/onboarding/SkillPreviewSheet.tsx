"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/shadcn/sheet";
import { InlineMarkdown } from "@/components/common/MarkdownComment";

interface SkillPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  agentName: string;
  agentEmoji: string;
}

export function SkillPreviewSheet({
  open,
  onOpenChange,
  templateId,
  agentName,
  agentEmoji,
}: SkillPreviewSheetProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || content) return;

    setLoading(true);
    setError(false);
    fetch(`/api/agents/templates/${templateId}/skills`)
      .then((r) => r.json())
      .then((data) => {
        setContent(data.content ?? null);
        if (!data.content) setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, templateId, content]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span>{agentEmoji}</span>
            <span>{agentName}</span>
          </SheetTitle>
          <SheetDescription>Skill guide and methodology</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No skill guide available for this agent.
            </p>
          )}

          {content && <InlineMarkdown content={content} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
