"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "../ui";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={handleCopy}
      className={`text-muted-foreground hover:text-foreground hover:bg-muted ${className}`}
      title="Copy markdown"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-success" />
          {label && <span className="text-success">Copied</span>}
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          {label && <span>Copy</span>}
        </>
      )}
    </Button>
  );
}
