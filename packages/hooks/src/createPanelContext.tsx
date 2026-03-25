import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode, ReactElement } from "react";

export interface PanelContextValue {
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
}

/**
 * Factory that creates a typed panel / detail-pane context with open(id) / close() helpers.
 * Works in React (web/Electron) and React Native.
 *
 * @example
 * const { Provider: AgentDetailProvider, usePanel: useAgentDetail } =
 *   createPanelContext("AgentDetail");
 */
export function createPanelContext(displayName: string): {
  Provider: (props: { children: ReactNode }) => ReactElement;
  usePanel: () => PanelContextValue;
} {
  const Context = createContext<PanelContextValue | undefined>(undefined);
  Context.displayName = `${displayName}Context`;

  function Provider({ children }: { children: ReactNode }) {
    const [openId, setOpenId] = useState<string | null>(null);
    const open = useCallback((id: string) => setOpenId(id), []);
    const close = useCallback(() => setOpenId(null), []);
    return <Context.Provider value={{ openId, open, close }}>{children}</Context.Provider>;
  }

  function usePanel(): PanelContextValue {
    const ctx = useContext(Context);
    if (!ctx) {
      throw new Error(`use${displayName} must be used within ${displayName}Provider`);
    }
    return ctx;
  }

  return { Provider, usePanel };
}
