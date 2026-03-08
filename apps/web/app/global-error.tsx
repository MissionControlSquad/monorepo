"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            background: "#0a0a0a",
            color: "#fafafa",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 400, padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16 }}>
              A critical error occurred. Please refresh the page.
            </p>
            <button
              onClick={reset}
              style={{
                background: "transparent",
                border: "none",
                color: "#3b82f6",
                cursor: "pointer",
                fontSize: 14,
                padding: 0,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
