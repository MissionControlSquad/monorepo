"use client";

import { marked } from "marked";
import DOMPurify from "dompurify";
import { useMemo } from "react";
import "./MarkdownComment.css";
import { TimeAgo } from "./TimeAgo";

interface MarkdownCommentProps {
  content: string;
  author?: string;
  timestamp?: number;
  className?: string;
}

/**
 * Renders markdown content as formatted HTML
 * Sanitizes and styles the output for safe display
 */
export function MarkdownComment({
  content,
  author,
  timestamp,
  className = "",
}: MarkdownCommentProps) {
  // Configure marked options
  marked.setOptions({
    breaks: true, // Convert \n to <br>
    gfm: true, // GitHub Flavored Markdown
  });

  // Parse markdown to HTML and sanitize to prevent XSS
  const htmlContent = useMemo(() => {
    try {
      const raw = marked.parse(content, { async: false }) as string;
      return DOMPurify.sanitize(raw);
    } catch (error) {
      console.error("Error parsing markdown:", error);
      return DOMPurify.sanitize(`<p>${content}</p>`);
    }
  }, [content]);

  return (
    <div className={`markdown-comment ${className}`}>
      {(author || timestamp) && (
        <div className="comment-meta">
          {author && <span className="comment-author">{author}</span>}
          {timestamp && <TimeAgo date={timestamp} className="comment-time" />}
        </div>
      )}

      <div className="markdown-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
}

/**
 * Lightweight version without metadata
 */
export function InlineMarkdown({ content }: { content: string }) {
  const htmlContent = useMemo(() => {
    try {
      const raw = marked.parse(content, { async: false }) as string;
      return DOMPurify.sanitize(raw);
    } catch (error) {
      console.error("Error parsing markdown:", error);
      return DOMPurify.sanitize(`<p>${content}</p>`);
    }
  }, [content]);

  return <div className="markdown-inline" dangerouslySetInnerHTML={{ __html: htmlContent }} />;
}
