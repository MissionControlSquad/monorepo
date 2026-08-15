import { useCallback, useState } from "react";

export interface Disclosure {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Direct setter — pass straight to Radix `onOpenChange`. */
  setOpen: (value: boolean) => void;
}

/**
 * Boolean open/close state for a modal/dialog/popover — replaces the ubiquitous
 * `const [open, setOpen] = useState(false)` + hand-written open/close/toggle handlers.
 *
 *   const modal = useDisclosure();
 *   <Dialog open={modal.isOpen} onOpenChange={modal.setOpen}> ... <button onClick={modal.open}>
 */
export function useDisclosure(initialOpen = false): Disclosure {
  const [isOpen, setOpen] = useState(initialOpen);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  return { isOpen, open, close, toggle, setOpen };
}

/**
 * "Which item is open" state for row-scoped dialogs — replaces the `const [openX, setOpenX] =
 * useState<T | null>(null)` pattern. `isOpen(id)` compares, `open(id)`/`close()` set.
 */
export function useSingletonDisclosure<T>() {
  const [current, setCurrent] = useState<T | null>(null);
  const open = useCallback((value: T) => setCurrent(value), []);
  const close = useCallback(() => setCurrent(null), []);
  const isOpen = useCallback((value: T) => current === value, [current]);
  return { current, open, close, isOpen };
}
