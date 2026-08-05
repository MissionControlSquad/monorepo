"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Controlled form state for a self-contained dialog COMPONENT (the parent owns `open`). Resets to
 * `empty` — or to `editing` mapped through `toValues` — whenever the dialog opens, so one dialog
 * component handles both create and edit. `submit(values, editing)` returns an inline error message,
 * or null/undefined on success (which closes the dialog via onOpenChange(false) and runs onDone).
 *
 * Use this INSIDE an extracted `<XDialog>` component; use `useResourceDialog` when a page owns the
 * open state + trigger inline.
 */
export function useResourceForm<T extends Record<string, unknown>, E = unknown>(opts: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empty: T;
  editing?: E | null;
  toValues?: (editing: E) => T;
  submit: (values: T, editing: E | null) => Promise<string | null | undefined | void>;
  onDone?: () => void;
}) {
  const { open, onOpenChange, empty, editing, toValues, submit, onDone } = opts;
  const [values, setValues] = useState<T>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset (create) or prefill (edit) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setValues(editing && toValues ? toValues(editing) : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = useCallback(<K extends keyof T>(key: K, val: T[K]) => {
    setValues((v) => ({ ...v, [key]: val }));
  }, []);

  const onSubmit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const err = await submit(values, editing ?? null);
      if (err) {
        setError(err);
        return;
      }
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, [values, editing, submit, onOpenChange, onDone]);

  return { values, set, setValues, busy, error, isEditing: editing != null, onSubmit };
}

/**
 * Reusable create/edit dialog state for a resource, so pages don't re-implement the
 * open / busy / error / values / editing-id boilerplate for every CRUD form.
 *
 * `submit(values, editingId)` runs the create (editingId === null) or update mutation and returns an
 * error message to show inline, or null/undefined on success (which closes the dialog + runs onDone).
 */
export function useResourceDialog<T extends Record<string, unknown>>(opts: {
  empty: T;
  submit: (values: T, editingId: string | null) => Promise<string | null | undefined | void>;
  onDone?: () => void;
}) {
  const { empty, submit, onDone } = opts;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<T>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setValues(empty);
    setEditingId(null);
    setError(null);
    setOpen(true);
  }, [empty]);

  const openEdit = useCallback((id: string, initial: T) => {
    setValues(initial);
    setEditingId(id);
    setError(null);
    setOpen(true);
  }, []);

  /** Update a single field: `set("name", e.target.value)`. */
  const set = useCallback(<K extends keyof T>(key: K, val: T[K]) => {
    setValues((v) => ({ ...v, [key]: val }));
  }, []);

  const onSubmit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const err = await submit(values, editingId);
      if (err) {
        setError(err);
        return;
      }
      setOpen(false);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, [values, editingId, submit, onDone]);

  return {
    open,
    setOpen,
    values,
    set,
    setValues,
    editingId,
    isEditing: editingId !== null,
    busy,
    error,
    openCreate,
    openEdit,
    onSubmit,
  };
}

/**
 * Reusable delete-with-confirmation state, paired with the shared ConfirmDialog. Tracks the item
 * pending deletion so the page renders one confirm dialog instead of window.confirm / ad-hoc state.
 */
export function useConfirmDelete<T>(opts: {
  onDelete: (item: T) => Promise<string | null | undefined | void>;
  onDone?: () => void;
}) {
  const { onDelete, onDone } = opts;
  const [target, setTarget] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback((item: T) => {
    setError(null);
    setTarget(item);
  }, []);

  const cancel = useCallback(() => setTarget(null), []);

  const confirm = useCallback(async () => {
    if (target == null) return;
    setBusy(true);
    setError(null);
    try {
      const err = await onDelete(target);
      if (err) {
        setError(err);
        return;
      }
      setTarget(null);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }, [target, onDelete, onDone]);

  return { target, isOpen: target !== null, busy, error, ask, cancel, confirm };
}
