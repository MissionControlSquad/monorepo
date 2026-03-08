"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

type ChannelsLayoutContextValue = {
  channelListOpen: boolean;
  openChannelList: () => void;
  closeChannelList: () => void;
  infoSidebarOpen: boolean;
  openInfoSidebar: () => void;
  closeInfoSidebar: () => void;
  createModalOpen: boolean;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  /** Call when channel read state changes so the sidebar can refetch unread counts. */
  refetchChannelList: () => void;
  /** Register the refetch function (sidebar sets this in useEffect; stored in a ref to avoid setState-during-render). */
  setRefetchChannelList: (fn: (() => void) | null) => void;
};

const ChannelsLayoutContext = createContext<ChannelsLayoutContextValue | null>(null);

export function ChannelsLayoutProvider({ children }: { children: ReactNode }) {
  const [channelListOpen, setChannelListOpen] = useState(false);
  const [infoSidebarOpen, setInfoSidebarOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const refetchChannelListRef = useRef<(() => void) | null>(null);
  const refetchChannelList = useCallback(() => {
    refetchChannelListRef.current?.();
  }, []);
  const setRefetchChannelList = useCallback((fn: (() => void) | null) => {
    refetchChannelListRef.current = fn;
  }, []);
  const openChannelList = useCallback(() => setChannelListOpen(true), []);
  const closeChannelList = useCallback(() => setChannelListOpen(false), []);
  const openInfoSidebar = useCallback(() => setInfoSidebarOpen(true), []);
  const closeInfoSidebar = useCallback(() => setInfoSidebarOpen(false), []);
  const openCreateModal = useCallback(() => setCreateModalOpen(true), []);
  const closeCreateModal = useCallback(() => setCreateModalOpen(false), []);
  return (
    <ChannelsLayoutContext.Provider
      value={{
        channelListOpen,
        openChannelList,
        closeChannelList,
        infoSidebarOpen,
        openInfoSidebar,
        closeInfoSidebar,
        createModalOpen,
        openCreateModal,
        closeCreateModal,
        refetchChannelList,
        setRefetchChannelList,
      }}
    >
      {children}
    </ChannelsLayoutContext.Provider>
  );
}

export function useChannelsLayout() {
  const ctx = useContext(ChannelsLayoutContext);
  return ctx;
}
