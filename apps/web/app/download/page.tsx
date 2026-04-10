"use client";

import { useEffect, useState } from "react";

interface DesktopRelease {
  version: string;
  name: string;
  publishedAt: string;
  releaseUrl: string;
  assets: {
    mac?: { url: string; size: number };
    win?: { url: string; size: number };
    linux?: { url: string; size: number };
  };
}

type Platform = "mac" | "win" | "linux" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac os x") || ua.includes("macintosh")) return "mac";
  if (ua.includes("windows")) return "win";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  mac: "macOS",
  win: "Windows",
  linux: "Linux",
  unknown: "Desktop",
};

const PLATFORM_ICONS: Record<Platform, string> = {
  mac: "🍎",
  win: "🪟",
  linux: "🐧",
  unknown: "💻",
};

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [release, setRelease] = useState<DesktopRelease | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPlatform(detectPlatform());
    fetch("/api/desktop-release")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(true);
        else setRelease(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const primaryAsset = release?.assets[platform as "mac" | "win" | "linux"] ?? null;

  const otherPlatforms = (["mac", "win", "linux"] as const).filter(
    (p) => p !== platform && release?.assets[p],
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center justify-center px-4 py-16">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl font-bold">
          A
        </div>
        <span className="text-2xl font-semibold tracking-tight">AgentCenter</span>
      </div>

      <h1 className="text-4xl font-bold text-center mb-2">Download AgentCenter</h1>
      <p className="text-gray-400 text-center mb-10 max-w-md">
        Mission control for your AI agents — available for macOS, Windows, and Linux.
      </p>

      {/* Version badge */}
      {release && (
        <span className="text-xs font-mono bg-white/10 px-3 py-1 rounded-full mb-8 text-gray-300">
          v{release.version}
        </span>
      )}

      {/* Primary download card */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 mb-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Fetching latest release…</span>
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-red-400 mb-3 text-sm">Could not load release info.</p>
            <a
              href={`https://github.com/MissionControlSquad/monorepo/releases/latest`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 underline text-sm"
            >
              View releases on GitHub →
            </a>
          </div>
        ) : primaryAsset ? (
          <>
            <a
              href={primaryAsset.url}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-semibold py-3 px-6 rounded-xl text-lg mb-2"
            >
              <span>{PLATFORM_ICONS[platform]}</span>
              <span>Download for {PLATFORM_LABELS[platform]}</span>
            </a>
            <p className="text-xs text-center text-gray-500">
              {formatBytes(primaryAsset.size)}
              {platform === "win" && " · NSIS Installer · x64 + ARM64"}
              {platform === "mac" && " · Universal DMG · Intel + Apple Silicon"}
              {platform === "linux" && " · AppImage · x64 + ARM64"}
            </p>
          </>
        ) : (
          <a
            href={`https://github.com/MissionControlSquad/monorepo/releases/latest`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-semibold py-3 px-6 rounded-xl text-lg"
          >
            View Latest Release →
          </a>
        )}
      </div>

      {/* Other platforms */}
      {!loading && !error && otherPlatforms.length > 0 && (
        <div className="flex gap-3 mb-8">
          {otherPlatforms.map((p) => (
            <a
              key={p}
              href={release!.assets[p]!.url}
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1 rounded-lg border border-white/10 hover:border-white/20"
            >
              {PLATFORM_ICONS[p]} {PLATFORM_LABELS[p]}
            </a>
          ))}
        </div>
      )}

      {/* Unsigned Mac instructions */}
      {platform === "mac" && !loading && !error && (
        <div className="w-full max-w-sm bg-amber-950/40 border border-amber-700/40 rounded-xl p-4 mb-6">
          <p className="text-amber-300 text-sm font-semibold mb-2">⚠️ First launch on macOS</p>
          <p className="text-amber-200/70 text-sm mb-3">
            macOS may show &ldquo;cannot be opened because Apple cannot check it for malicious
            software.&rdquo; This is expected for direct downloads.
          </p>
          <ol className="text-amber-200/70 text-sm space-y-1 list-decimal list-inside">
            <li>Open the DMG and drag AgentCenter to Applications</li>
            <li>
              Right-click{" "}
              <code className="font-mono bg-black/30 px-1 rounded">AgentCenter.app</code> →{" "}
              <strong>Open</strong> → click <strong>Open</strong>
            </li>
            <li>Only required the first time</li>
          </ol>
          <details className="mt-3">
            <summary className="text-amber-400 text-xs cursor-pointer hover:text-amber-300">
              Terminal alternative
            </summary>
            <code className="block mt-2 text-xs font-mono bg-black/40 rounded px-3 py-2 text-amber-200/70 select-all">
              xattr -cr /Applications/AgentCenter.app
            </code>
          </details>
        </div>
      )}

      {/* Windows SmartScreen instructions */}
      {platform === "win" && !loading && !error && (
        <div className="w-full max-w-sm bg-blue-950/40 border border-blue-700/40 rounded-xl p-4 mb-6">
          <p className="text-blue-300 text-sm font-semibold mb-2">ℹ️ Windows SmartScreen</p>
          <p className="text-blue-200/70 text-sm">
            If SmartScreen shows &ldquo;Unknown publisher&rdquo;, click <strong>More info</strong> →{" "}
            <strong>Run anyway</strong>. This is expected for new software.
          </p>
        </div>
      )}

      {/* Auto-update notice */}
      <p className="text-xs text-gray-600 text-center max-w-sm">
        AgentCenter updates automatically in the background. You&apos;ll be notified when a new
        version is ready.
      </p>

      {release && (
        <a
          href={release.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Release notes →
        </a>
      )}
    </div>
  );
}
