"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, LogOut, Settings, User } from "lucide-react";
import { useSaaSAuth } from "@buildbase/sdk/react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { useAppContext } from "@/components/context/AppContext";
import { ProfileAvatar } from "@/components/ui";
import { API_ROUTES } from "@/lib/api-routes";

/**
 * The app's SINGLE account/profile menu — the avatar at the BOTTOM of the icon-rail. Profile,
 * Settings, and Billing open buildbase's built-in dialogs (openWorkspaceSettings); Log out uses the
 * buildbase sign-out. buildbase is the source of truth for identity, profile, and billing.
 *
 * IMPORTANT: this is a plain custom popover, NOT a Radix DropdownMenu. Opening the buildbase settings
 * dialog (itself a Radix Dialog) from a Radix DropdownMenuItem's onSelect makes the dropdown's dismiss
 * layer immediately close the just-opened dialog — so nothing appears. A plain <button onClick> in a
 * non-Radix popover avoids that interaction and reliably opens the modal.
 *
 * Dormant-safe: when buildbase is NOT configured (self-host without an org), useSaaSAuth is
 * unavailable, so we fall back to the app-operational Settings page + session logout.
 */

const MENU_ITEM =
  "flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted";

function BuildbaseActions({ onClose }: { onClose: () => void }) {
  const { openWorkspaceSettings, signOut } = useSaaSAuth();
  const act = (fn: () => void) => {
    onClose();
    fn();
  };
  return (
    <>
      <button
        type="button"
        className={MENU_ITEM}
        onClick={() => act(() => openWorkspaceSettings("profile"))}
      >
        <User className="h-4 w-4 text-muted-foreground" />
        Profile
      </button>
      <button
        type="button"
        className={MENU_ITEM}
        onClick={() => act(() => openWorkspaceSettings("general"))}
      >
        <Settings className="h-4 w-4 text-muted-foreground" />
        Settings
      </button>
      <button
        type="button"
        className={MENU_ITEM}
        onClick={() => act(() => openWorkspaceSettings("subscription"))}
      >
        <CreditCard className="h-4 w-4 text-muted-foreground" />
        Billing
      </button>
      <button type="button" className={MENU_ITEM} onClick={() => act(() => void signOut())}>
        <LogOut className="h-4 w-4 text-muted-foreground" />
        Log out
      </button>
    </>
  );
}

function LegacyActions({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  return (
    <>
      <Link href="/settings" onClick={onClose} className={MENU_ITEM}>
        <Settings className="h-4 w-4 text-muted-foreground" />
        Settings
      </Link>
      <button type="button" onClick={onLogout} className={MENU_ITEM}>
        <LogOut className="h-4 w-4 text-muted-foreground" />
        Log out
      </button>
    </>
  );
}

export function AccountMenuSlot() {
  const { currentUserProfile } = useAppContext();
  const ready = useBuildbaseReady();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await fetch(API_ROUTES.auth.logout, { method: "POST" });
    router.push("/login");
  }, [router]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const name = currentUserProfile?.displayName ?? "Account";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={name}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-border"
      >
        {currentUserProfile?.id ? (
          <ProfileAvatar profileId={currentUserProfile.id} size="md+" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground">
            ?
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-0 left-full z-[100] ml-2 w-52 rounded-lg border border-border bg-background py-1 shadow-lg">
          {currentUserProfile && (
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-sm font-medium text-foreground">
                {currentUserProfile.displayName}
              </p>
              {currentUserProfile.username && (
                <p className="truncate text-xs text-muted-foreground">
                  @{currentUserProfile.username}
                </p>
              )}
            </div>
          )}
          <div className="py-0.5">
            {ready ? (
              <BuildbaseActions onClose={() => setOpen(false)} />
            ) : (
              <LegacyActions onClose={() => setOpen(false)} onLogout={handleLogout} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
