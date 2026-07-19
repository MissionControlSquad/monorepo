"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui";

// Tier D (Slice 6): browser Cloud-Shell. Opens the PTY WebSocket authenticated by the one-time
// connect token, streams SSH output, and forwards keystrokes. Deliberately dependency-free — it
// speaks the real relay protocol; xterm.js can be dropped in at this same seam for full ANSI
// rendering. Common ANSI escapes are stripped here so raw output stays readable.

// Strip the common ANSI escape sequences a PTY emits so raw output stays readable without xterm.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][AB012]|\x1b[=>]|\r(?!\n)/g;

function keyToBytes(e: React.KeyboardEvent): string | null {
  if (e.ctrlKey && e.key.length === 1) {
    const code = e.key.toLowerCase().charCodeAt(0);
    if (code >= 97 && code <= 122) return String.fromCharCode(code - 96); // Ctrl-A..Z
  }
  switch (e.key) {
    case "Enter":
      return "\r";
    case "Backspace":
      return "\x7f";
    case "Tab":
      return "\t";
    case "Escape":
      return "\x1b";
    case "ArrowUp":
      return "\x1b[A";
    case "ArrowDown":
      return "\x1b[B";
    case "ArrowRight":
      return "\x1b[C";
    case "ArrowLeft":
      return "\x1b[D";
    default:
      return e.key.length === 1 ? e.key : null;
  }
}

export function TerminalConsole({
  sessionId,
  connectToken,
  onClose,
}: {
  sessionId: string;
  connectToken: string;
  onClose: () => void;
}) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("connecting…");
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/api/terminals/pty?id=${encodeURIComponent(
      sessionId,
    )}&token=${encodeURIComponent(connectToken)}`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    const append = (text: string) => setOutput((prev) => (prev + text).slice(-100_000));

    ws.onopen = () => setStatus("connected");
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);
          if (msg?.type === "error") {
            setStatus(`error: ${msg.message}`);
            return;
          }
        } catch {
          /* not JSON — treat as text output */
        }
        append(e.data.replace(ANSI, ""));
      } else {
        append(new TextDecoder().decode(new Uint8Array(e.data as ArrayBuffer)).replace(ANSI, ""));
      }
    };
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("connection error");
    return () => ws.close();
  }, [sessionId, connectToken]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [output]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const bytes = keyToBytes(e);
    if (bytes != null) {
      e.preventDefault();
      ws.send(bytes);
    }
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          shell · <span className="font-mono">{status}</span>
        </span>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Disconnect
        </Button>
      </div>
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="h-80 overflow-y-auto bg-black p-3 font-mono text-xs text-green-400 outline-none focus:ring-1 focus:ring-inset focus:ring-green-500"
      >
        <pre className="whitespace-pre-wrap break-words">
          {output || "Click here and start typing…"}
        </pre>
      </div>
    </div>
  );
}
