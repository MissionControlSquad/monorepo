"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import TimeAgoLib from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";

TimeAgoLib.addDefaultLocale(en);

const timeAgo = new TimeAgoLib("en-US");

interface TimeAgoProps {
  date: number | Date | string;
  className?: string;
  tooltip?: boolean;
}

export function TimeAgo({ date, className, tooltip = true }: TimeAgoProps) {
  const timestamp = typeof date === "number" ? date : new Date(date).getTime();
  const [, setTick] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!tooltip || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setCoords({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
    setHovered(true);
  }, [tooltip]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);

  const formatted = timeAgo.format(timestamp);
  const fullDate = new Date(timestamp).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <span
      ref={ref}
      className={`inline-flex ${className ?? ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <time dateTime={new Date(timestamp).toISOString()} className="cursor-default">
        {formatted}
      </time>
      {tooltip &&
        hovered &&
        coords &&
        createPortal(
          <span
            style={{ top: coords.top, left: coords.left }}
            className="fixed -translate-x-1/2 -translate-y-full -mt-1.5 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-white shadow-lg z-[9999] pointer-events-none"
          >
            {fullDate}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
          </span>,
          document.body,
        )}
    </span>
  );
}

export function formatTimeAgo(date: number | Date | string): string {
  const timestamp = typeof date === "number" ? date : new Date(date).getTime();
  return timeAgo.format(timestamp);
}
