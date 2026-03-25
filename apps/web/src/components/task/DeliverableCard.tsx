"use client";

import { memo, useCallback } from "react";
import { FileText, Code2, File, Link, ExternalLink } from "lucide-react";
import { TimeAgo } from "../common/TimeAgo";
import { useHighlightedHtml } from "../../lib/useHighlight";
import { Badge, Button } from "../ui";
import { MentionText } from "../common/MarkdownWithMentions";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { getAssetUrl, formatFileSize, stripMarkdown } from "@agentcenter/utils";
import type { Deliverable, Agent } from "@agentcenter/types";

interface DeliverableCardProps {
  deliverable: Deliverable;
  agent?: Agent | null;
  onClick: () => void;
}

const KIND_CONFIG = {
  markdown: { label: "Markdown", variant: "purple" as const, icon: FileText },
  code: { label: "Code", variant: "blue" as const, icon: Code2 },
  file: { label: "File", variant: "orange" as const, icon: File },
  link: { label: "Link", variant: "green" as const, icon: Link },
};

function CodePreview({ content, language }: { content: string; language?: string }) {
  const snippet = content.split("\n").slice(0, 4).join("\n");
  const highlightedHtml = useHighlightedHtml(snippet, language);

  return (
    <pre className="text-xs bg-gray-800 rounded p-2 mt-1 line-clamp-4 overflow-hidden font-mono">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
    </pre>
  );
}

export const DeliverableCard = memo(function DeliverableCard({
  deliverable,
  agent,
  onClick,
}: DeliverableCardProps) {
  const config = KIND_CONFIG[deliverable.kind as keyof typeof KIND_CONFIG];

  const isImageFile = deliverable.kind === "file" && deliverable.mimeType?.startsWith("image/");

  const fileUrl = isImageFile
    ? (getAssetUrl(deliverable.storageKey) ?? deliverable.url ?? null)
    : null;

  const isLink = deliverable.kind === "link";

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") onClick();
    },
    [onClick],
  );

  return (
    <div
      role={isLink ? undefined : "button"}
      tabIndex={isLink ? undefined : 0}
      onClick={isLink ? undefined : onClick}
      onKeyDown={isLink ? undefined : handleKeyDown}
      aria-label={isLink ? undefined : `Open deliverable: ${deliverable.title}`}
      className={`w-full text-left rounded-lg border border-border p-3 transition-colors ${
        isLink ? "" : "hover:border-border cursor-pointer"
      }`}
    >
      {/* Header row: kind badge + title + timestamp */}
      <div className="flex items-center gap-2 mb-1.5">
        <Badge variant={config.variant} size="sm">
          {config.label}
        </Badge>
        {deliverable.kind === "code" && deliverable.language && (
          <Badge variant="gray" size="sm">
            {deliverable.language}
          </Badge>
        )}
        <span className="text-sm font-medium text-foreground truncate flex-1">
          {deliverable.title}
        </span>
        {(deliverable.version ?? 0) > 1 && (
          <Badge variant="gray" size="sm">
            v{deliverable.version}
          </Badge>
        )}
        <TimeAgo
          date={deliverable.createdAt ?? ""}
          className="text-xs text-muted-foreground shrink-0"
        />
      </div>

      {/* Agent row */}
      {agent && (
        <div className="flex items-center gap-1.5 mb-2">
          <ProfileAvatar agentId={agent.id} size="xs" />
          <span className="text-xs text-muted-foreground truncate">{agent.name}</span>
        </div>
      )}

      {/* Preview by kind */}
      {deliverable.kind === "markdown" && deliverable.content && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          <MentionText content={stripMarkdown(deliverable.content).slice(0, 150)} />
        </p>
      )}

      {deliverable.kind === "code" && deliverable.content && (
        <CodePreview content={deliverable.content} language={deliverable.language ?? undefined} />
      )}

      {deliverable.kind === "file" &&
        (isImageFile && fileUrl ? (
          <div className="mt-2 rounded overflow-hidden bg-muted">
            <img
              src={fileUrl}
              alt={deliverable.fileName || deliverable.title}
              className="w-full h-24 object-cover"
              loading="lazy"
            />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1.5 bg-muted">
              <File className="w-3 h-3" />
              <span className="truncate">
                {deliverable.fileName || "Untitled file"}
                {deliverable.fileSize != null && ` · ${formatFileSize(deliverable.fileSize)}`}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <File className="w-3.5 h-3.5" />
            <span>
              {deliverable.fileName || "Untitled file"}
              {deliverable.fileSize != null && ` · ${formatFileSize(deliverable.fileSize)}`}
            </span>
          </div>
        ))}

      {deliverable.kind === "link" && deliverable.url && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-muted-foreground truncate flex-1">{deliverable.url}</span>
          <a
            href={deliverable.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="primary" size="sm" icon={<ExternalLink />}>
              Open Link
            </Button>
          </a>
        </div>
      )}
    </div>
  );
});
