"use client";

import { createPortal } from "react-dom";
import { ActivityFeed } from "./ActivityFeed";
import { ErrorBoundary, PanelErrorFallback } from "../common/ErrorBoundary";

interface ActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  onTaskClick: (taskId: string) => void;
}

export function ActivityDrawer({ open, onClose, onTaskClick }: ActivityDrawerProps) {
  return createPortal(
    <>
      {open && (
        <div
          key="activity-backdrop"
          className="fixed inset-x-0 bottom-0 top-titlebar bg-black/30 z-40"
          onClick={onClose}
        />
      )}
      <aside
        key="activity-drawer"
        className={`
          fixed bottom-0 top-titlebar right-0 z-50 w-full sm:w-96 bg-background border-l border-border shadow-xl
          flex flex-col
          transition-transform duration-200 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        <ErrorBoundary
          fallback={({ resetErrorBoundary, error }) => (
            <PanelErrorFallback label="Activity feed" error={error} onRetry={resetErrorBoundary} />
          )}
        >
          <ActivityFeed onTaskClick={onTaskClick} onClose={onClose} />
        </ErrorBoundary>
      </aside>
    </>,
    document.body,
  );
}
