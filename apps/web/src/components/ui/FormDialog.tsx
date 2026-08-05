"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/shadcn/dialog";
import { Button } from "./Button";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Called on submit (form already prevents default). */
  onSubmit: () => void;
  submitLabel?: string;
  busy?: boolean;
  submitDisabled?: boolean;
  error?: string | null;
  /** Dialog width. Defaults to a comfortable form width. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Consistent modal form: a titled dialog with a scrollable body, an inline error line, and
 * Cancel / submit actions. Replaces the ad-hoc inline "New X" cards so every create/edit form
 * opens in a modal instead of pushing page content around.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel = "Save",
  busy = false,
  submitDisabled = false,
  error,
  className = "sm:max-w-lg",
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          <div className="max-h-[65vh] space-y-4 overflow-y-auto">{children}</div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || submitDisabled}>
              {busy ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
