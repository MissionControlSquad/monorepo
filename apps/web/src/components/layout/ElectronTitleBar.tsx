"use client";

/**
 * ElectronTitleBar
 *
 * Renders a native-feeling title bar when the app is running inside the
 * Electron desktop app on macOS.  The Electron main process injects the CSS
 * variable --electron-titlebar-height (38px on macOS, 0px otherwise), so
 * this component is automatically invisible in a regular browser tab.
 *
 * It sits at z-[9998] — above all sidebars, drawers and notifications — so
 * every fixed element is visually covered even if its own top value is 0.
 * The actual window-drag behaviour is handled by the transparent overlay
 * injected by the Electron main process (z-index 2147483647).
 */
export function ElectronTitleBar() {
  return (
    <div
      className="fixed left-0 right-0 z-[9998] overflow-hidden flex items-center justify-center select-none pointer-events-none"
      style={{
        top: 0,
        height: "var(--electron-titlebar-height, 0px)",
        backgroundColor: "var(--color-sidebar)",
        borderBottom: "1px solid var(--color-sidebar-border)",
      }}
    >
      <span
        className="text-xs font-semibold tracking-wide"
        style={{ color: "var(--color-sidebar-foreground)", opacity: 0.45 }}
      >
        AgentCenter
      </span>
    </div>
  );
}
