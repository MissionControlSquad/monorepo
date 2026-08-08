"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Terminal,
  Copy,
  Check,
  Loader2,
  Radio,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  PartyPopper,
} from "lucide-react";
import { Button } from "../ui";
import { API_ROUTES } from "@/lib/api-routes";
import {
  LOCAL_STEPS,
  type LocalStep,
  localStepPosition,
  runnerInstallCommand,
  runnerLoginCommand,
  runnerStartCommand,
  mapPollStatus,
  isPairingComplete,
  isPairingPollable,
  pairingStatusLabel,
  formatUserCode,
  type PairingStatus,
} from "@/lib/onboarding-local";

interface LocalInstallStepProps {
  onBack: () => void;
  onComplete: () => void;
}

interface Challenge {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
}

const POLL_INTERVAL_MS = 3_000;

// ─── Small presentational helpers ──────────────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [code]);

  return (
    <div className="relative group">
      <pre className="text-xs bg-background border border-border rounded-lg px-3.5 py-3 pr-16 font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {code}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted border border-border text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function StepPill({ step }: { step: LocalStep }) {
  const { step: n, total } = localStepPosition(step);
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border text-xs text-muted-foreground">
      <Terminal className="w-3 h-3 text-primary" />
      Local install - Step {n} of {total}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function LocalInstallStep({ onBack, onComplete }: LocalInstallStepProps) {
  const [step, setStep] = useState<LocalStep>(LOCAL_STEPS[0]);

  // Pairing state (cli-auth device flow).
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<PairingStatus>("idle");
  const [starting, setStarting] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiUrl = typeof window !== "undefined" ? window.location.origin : "";

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => clearPoll, [clearPoll]);

  // Start a cli-auth device-pairing challenge.
  const startPairing = useCallback(async () => {
    setStarting(true);
    setStatus("idle");
    setChallenge(null);
    setApiKey(null);
    clearPoll();
    try {
      const res = await fetch(API_ROUTES.cliAuth.start, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyName: "Local runner" }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Challenge;
      setChallenge({
        deviceCode: data.deviceCode,
        userCode: data.userCode,
        verificationUrl: data.verificationUrl,
      });
      setStatus("pending");
    } catch {
      setStatus("error");
    } finally {
      setStarting(false);
    }
  }, [clearPoll]);

  // Poll for approval while a challenge is pending.
  useEffect(() => {
    if (step !== "connect" || !challenge || !isPairingPollable(status)) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(API_ROUTES.cliAuth.poll, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode: challenge.deviceCode }),
        });
        if (!res.ok) {
          setStatus("error");
          clearPoll();
          return;
        }
        const data = (await res.json()) as { status?: string; apiKey?: string };
        const mapped = mapPollStatus(data.status);
        setStatus(mapped);
        if (isPairingComplete(mapped)) {
          if (data.apiKey) setApiKey(data.apiKey);
          clearPoll();
          setStep("connected");
        } else if (!isPairingPollable(mapped)) {
          clearPoll();
        }
      } catch {
        setStatus("error");
        clearPoll();
      }
    }, POLL_INTERVAL_MS);
    return clearPoll;
  }, [step, challenge, status, clearPoll]);

  const goConnect = useCallback(() => {
    setStep("connect");
    void startPairing();
  }, [startPairing]);

  const installCmd = runnerInstallCommand();

  return (
    <div className="h-dvh bg-muted overflow-y-auto">
      <div className="max-w-2xl w-full mx-auto px-4 py-4 sm:py-6 min-h-full">
        {/* Nav */}
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <button
            onClick={step === "install" ? onBack : () => setStep("install")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <StepPill step={step} />
        </div>

        {/* ── Step 1: Install ── */}
        {step === "install" && (
          <div className="space-y-6">
            <header className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                Install the AgentCenter runner
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                The runner is a small, outbound-only daemon. It runs your agents on this machine and
                connects back to the dashboard - no inbound ports, works behind NAT.
              </p>
            </header>

            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                Run this in your terminal (needs Node.js 18+):
              </p>
              <CodeBlock code={installCmd} />
              <p className="text-[11px] text-muted-foreground">
                Installs the <code className="font-mono">agentcenter-runner</code> command globally.
              </p>
            </section>

            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs font-semibold text-foreground mb-0.5">What happens next</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                After installing, you&apos;ll pair the runner with this workspace using a one-time
                code - then it&apos;s ready to pick up tasks.
              </p>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" iconRight={<ArrowRight />} onClick={goConnect}>
                I&apos;ve installed it
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Connect / pair ── */}
        {step === "connect" && (
          <div className="space-y-6">
            <header className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-foreground">Pair your machine</h2>
              <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                Approve the one-time code below to issue a runner key. This uses the same device
                pairing the CLI uses - your key never leaves this browser until you paste it.
              </p>
            </header>

            {/* Loading - starting challenge */}
            {starting && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Generating your pairing code…</p>
              </div>
            )}

            {/* Error - could not start / poll failed */}
            {!starting && status === "error" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-sm font-semibold text-destructive">Pairing failed</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We couldn&apos;t reach the pairing service. Check your connection and try again.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw />}
                  onClick={() => void startPairing()}
                >
                  Try again
                </Button>
              </div>
            )}

            {/* Expired / denied */}
            {!starting && (status === "expired" || status === "denied") && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {pairingStatusLabel(status)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {status === "expired"
                    ? "That pairing code timed out. Generate a fresh one to continue."
                    : "The pairing request was denied. You can start over below."}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw />}
                  onClick={() => void startPairing()}
                >
                  New code
                </Button>
              </div>
            )}

            {/* Pending - show code + waiting */}
            {!starting && status === "pending" && challenge && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-background p-6 text-center space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Your pairing code
                  </p>
                  <p className="text-3xl sm:text-4xl font-bold font-mono tracking-[0.2em] text-foreground select-all">
                    {formatUserCode(challenge.userCode)}
                  </p>
                  <a
                    href={challenge.verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    Approve this code
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Radio className="w-3.5 h-3.5 text-primary animate-pulse" />
                  <span>{pairingStatusLabel(status)}</span>
                </div>

                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <p className="text-xs font-semibold text-foreground mb-1">How to approve</p>
                  <ol className="space-y-1 text-[11px] text-muted-foreground leading-relaxed list-decimal list-inside">
                    <li>Open the approval page (button above) - you&apos;re already signed in.</li>
                    <li>
                      Confirm the code matches{" "}
                      <span className="font-mono text-foreground">
                        {formatUserCode(challenge.userCode)}
                      </span>
                      .
                    </li>
                    <li>This screen advances automatically once approved.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Connected ── */}
        {step === "connected" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-success/30 bg-success/8 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                <p className="text-base font-semibold text-success">Machine paired</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A runner key has been issued. Log in with it, then start the runner - it will begin
                polling this workspace for tasks.
              </p>
            </div>

            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                1. Log the runner in:
              </p>
              <CodeBlock code={runnerLoginCommand({ apiUrl, apiKey })} />
              {!apiKey && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Paste the key shown on the approval page in place of the placeholder.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                2. Start it:
              </p>
              <CodeBlock code={runnerStartCommand()} />
              <p className="text-[11px] text-muted-foreground">
                Leave it running - it reconnects automatically and reports results back here.
              </p>
            </section>

            <div className="flex justify-end">
              <Button variant="primary" icon={<PartyPopper />} onClick={onComplete}>
                Go to dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
