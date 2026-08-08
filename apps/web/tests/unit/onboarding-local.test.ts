import { describe, it, expect } from "vitest";
import {
  INSTALL_MODES,
  isInstallMode,
  LOCAL_STEPS,
  localStepIndex,
  localStepPosition,
  nextLocalStep,
  prevLocalStep,
  runnerInstallCommand,
  runnerLoginCommand,
  runnerStartCommand,
  normalizeApiUrl,
  mapPollStatus,
  isPairingComplete,
  isPairingPollable,
  pairingStatusLabel,
  formatUserCode,
  RUNNER_PACKAGE,
  DEFAULT_RUNNER_RUNTIME,
  type PairingStatus,
} from "@/lib/onboarding-local";

describe("install mode selection", () => {
  it("offers exactly cloud + local, with cloud recommended", () => {
    expect(INSTALL_MODES.map((m) => m.id)).toEqual(["cloud", "local"]);
    expect(INSTALL_MODES.find((m) => m.id === "cloud")?.recommended).toBe(true);
    expect(INSTALL_MODES.find((m) => m.id === "local")?.recommended).toBeUndefined();
  });

  it("every mode ships copy: title, tagline, description and bullets", () => {
    for (const mode of INSTALL_MODES) {
      expect(mode.title.length).toBeGreaterThan(0);
      expect(mode.tagline.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(0);
      expect(mode.bullets.length).toBeGreaterThan(0);
    }
  });

  it("copy uses spaced hyphens, never em dashes", () => {
    const allText = INSTALL_MODES.flatMap((m) => [m.description, ...m.bullets]).join(" ");
    expect(allText).not.toContain("—");
  });

  it("isInstallMode is a correct type guard", () => {
    expect(isInstallMode("cloud")).toBe(true);
    expect(isInstallMode("local")).toBe(true);
    expect(isInstallMode("hybrid")).toBe(false);
    expect(isInstallMode(null)).toBe(false);
    expect(isInstallMode(undefined)).toBe(false);
    expect(isInstallMode(1)).toBe(false);
  });
});

describe("local sub-flow step progression", () => {
  it("orders steps install -> connect -> connected", () => {
    expect(LOCAL_STEPS).toEqual(["install", "connect", "connected"]);
  });

  it("localStepIndex / localStepPosition are 0- and 1-based respectively", () => {
    expect(localStepIndex("install")).toBe(0);
    expect(localStepIndex("connected")).toBe(2);
    expect(localStepPosition("install")).toEqual({ step: 1, total: 3 });
    expect(localStepPosition("connect")).toEqual({ step: 2, total: 3 });
    expect(localStepPosition("connected")).toEqual({ step: 3, total: 3 });
  });

  it("advances forward and stops at the last step", () => {
    expect(nextLocalStep("install")).toBe("connect");
    expect(nextLocalStep("connect")).toBe("connected");
    expect(nextLocalStep("connected")).toBeNull();
  });

  it("goes back and stops at the first step", () => {
    expect(prevLocalStep("connected")).toBe("connect");
    expect(prevLocalStep("connect")).toBe("install");
    expect(prevLocalStep("install")).toBeNull();
  });

  it("next/prev are inverse for interior transitions", () => {
    for (const step of LOCAL_STEPS) {
      const next = nextLocalStep(step);
      if (next) expect(prevLocalStep(next)).toBe(step);
    }
  });
});

describe("runner command rendering", () => {
  it("install command installs the published runner package globally", () => {
    expect(runnerInstallCommand()).toBe(`npm i -g ${RUNNER_PACKAGE}`);
    expect(runnerInstallCommand()).toContain("@agentcenter/runner");
  });

  it("login command fills in the api url, key and default runtime", () => {
    const cmd = runnerLoginCommand({
      apiUrl: "https://app.agentcenter.cloud",
      apiKey: "mc_abc123",
    });
    expect(cmd).toBe(
      `agentcenter-runner login --api-url https://app.agentcenter.cloud --api-key mc_abc123 --runtime ${DEFAULT_RUNNER_RUNTIME}`,
    );
  });

  it("login command shows a placeholder until a key is minted", () => {
    expect(runnerLoginCommand({ apiUrl: "https://x.io", apiKey: null })).toContain(
      "<paste-key-from-approval>",
    );
    expect(runnerLoginCommand({ apiUrl: "https://x.io", apiKey: "   " })).toContain(
      "<paste-key-from-approval>",
    );
  });

  it("login command honours a custom runtime", () => {
    expect(
      runnerLoginCommand({ apiUrl: "https://x.io", apiKey: "mc_1", runtime: "claude" }),
    ).toContain("--runtime claude");
  });

  it("normalizeApiUrl strips a trailing slash and trims", () => {
    expect(normalizeApiUrl("https://x.io/")).toBe("https://x.io");
    expect(normalizeApiUrl("  https://x.io  ")).toBe("https://x.io");
    expect(normalizeApiUrl("https://x.io")).toBe("https://x.io");
  });

  it("login command uses the normalized url (no double slash)", () => {
    const cmd = runnerLoginCommand({ apiUrl: "https://app.example.com/", apiKey: "mc_1" });
    expect(cmd).toContain("--api-url https://app.example.com ");
    expect(cmd).not.toContain("example.com/ ");
  });

  it("start command is the runner start invocation", () => {
    expect(runnerStartCommand()).toBe("agentcenter-runner start");
  });
});

describe("pairing status (cli-auth device flow)", () => {
  it("maps known cli-auth statuses and defaults unknown to error", () => {
    expect(mapPollStatus("pending")).toBe("pending");
    expect(mapPollStatus("approved")).toBe("approved");
    expect(mapPollStatus("denied")).toBe("denied");
    expect(mapPollStatus("expired")).toBe("expired");
    expect(mapPollStatus("weird")).toBe("error");
    expect(mapPollStatus(null)).toBe("error");
    expect(mapPollStatus(undefined)).toBe("error");
  });

  it("only 'approved' is complete", () => {
    expect(isPairingComplete("approved")).toBe(true);
    for (const s of ["idle", "pending", "denied", "expired", "error"] as PairingStatus[]) {
      expect(isPairingComplete(s)).toBe(false);
    }
  });

  it("keeps polling only while idle or pending", () => {
    expect(isPairingPollable("idle")).toBe(true);
    expect(isPairingPollable("pending")).toBe(true);
    for (const s of ["approved", "denied", "expired", "error"] as PairingStatus[]) {
      expect(isPairingPollable(s)).toBe(false);
    }
  });

  it("has a label for every status", () => {
    for (const s of [
      "idle",
      "pending",
      "approved",
      "denied",
      "expired",
      "error",
    ] as PairingStatus[]) {
      expect(pairingStatusLabel(s).length).toBeGreaterThan(0);
    }
  });
});

describe("formatUserCode", () => {
  it("splits an even-length code in the middle for readability", () => {
    expect(formatUserCode("ABCD1234")).toBe("ABCD-1234");
    expect(formatUserCode("WXYZ12")).toBe("WXY-Z12");
  });

  it("leaves short or odd-length codes untouched", () => {
    expect(formatUserCode("ABC")).toBe("ABC");
    expect(formatUserCode("ABCDE")).toBe("ABCDE");
  });

  it("trims surrounding whitespace", () => {
    expect(formatUserCode("  ABCD1234  ")).toBe("ABCD-1234");
  });
});
