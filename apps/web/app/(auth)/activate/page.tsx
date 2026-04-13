"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { LicenseStatusCode } from "@/server/constants";
import {
  Loader2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Clock,
  XCircle,
} from "lucide-react";

interface LicenseInfo {
  status: "active" | "expired" | "invalid" | "revoked" | "grace" | "none";
  plan: string | null;
  org: string | null;
  expiresAt: string | null;
  message: string;
}

export default function ActivateLicensePage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLicense, setCurrentLicense] = useState<LicenseInfo | null>(null);

  useEffect(() => {
    fetch("/api/license")
      .then((r) => r.json())
      .then((data: LicenseInfo) => {
        if (data.status === LicenseStatusCode.ACTIVE) {
          // Already activated — go to login
          router.replace("/login");
          return;
        }
        setCurrentLicense(data);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Activation failed");
        return;
      }

      toast.success("License activated successfully");
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="AgentCenter"
            width={48}
            height={48}
            className="w-12 h-12 rounded-xl mb-5 inline-block"
          />
          <h1 className="text-xl font-semibold text-foreground">
            {currentLicense?.status === LicenseStatusCode.NONE
              ? "Activate AgentCenter"
              : "License Update Required"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {currentLicense?.status === LicenseStatusCode.NONE
              ? "Enter your license key to get started"
              : "Your license needs attention"}
          </p>
        </div>

        {/* Current license status banner (if expired/revoked/invalid) */}
        {currentLicense && currentLicense.status !== LicenseStatusCode.NONE && (
          <div className="mb-4 p-3 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-4">
            <div className="flex items-center gap-3">
              {currentLicense.status === LicenseStatusCode.EXPIRED && (
                <Clock className="h-5 w-5 text-amber-500 shrink-0" />
              )}
              {currentLicense.status === LicenseStatusCode.REVOKED && (
                <XCircle className="h-5 w-5 text-destructive shrink-0" />
              )}
              {currentLicense.status === LicenseStatusCode.INVALID && (
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              )}
              {currentLicense.status === LicenseStatusCode.GRACE && (
                <ShieldCheck className="h-5 w-5 text-amber-500 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {currentLicense.status === LicenseStatusCode.EXPIRED && "License Expired"}
                  {currentLicense.status === LicenseStatusCode.REVOKED && "License Revoked"}
                  {currentLicense.status === LicenseStatusCode.INVALID && "Invalid License"}
                  {currentLicense.status === LicenseStatusCode.GRACE && "License Grace Period"}
                </p>
                {currentLicense.org && (
                  <p className="text-xs text-muted-foreground">
                    {currentLicense.org}
                    {currentLicense.plan && ` \u00b7 ${currentLicense.plan}`}
                  </p>
                )}
                {currentLicense.expiresAt && (
                  <p className="text-xs text-muted-foreground">
                    Expired: {new Date(currentLicense.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Activation Card */}
        <div className="p-0 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-6">
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label
                htmlFor="license-key"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                License Key
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <textarea
                  id="license-key"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setError(null);
                  }}
                  placeholder="eyJhbGciOiJSUzI1NiI..."
                  rows={3}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
                  autoFocus
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {currentLicense?.status === LicenseStatusCode.NONE
                  ? "Paste the license key provided by your administrator"
                  : "Enter a new license key to re-activate"}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button type="submit" disabled={loading || !key.trim()} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  <CheckCircle2 />
                  Activate License
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Help text */}
        <div className="text-center mt-6 space-y-1">
          <p className="text-xs text-muted-foreground">
            Don&apos;t have a license key?{" "}
            <a
              href="https://agentcenter.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline"
            >
              Contact sales
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            <a
              href="https://agentcenter.cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              agentcenter.cloud
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
