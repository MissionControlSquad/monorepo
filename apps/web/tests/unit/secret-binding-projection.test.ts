import { describe, it, expect } from "vitest";
import {
  selectBindingVersion,
  normalizeVersionSelector,
  projectResolvedBindings,
  isProjectionClass,
  isSecretBindingScope,
  mergeEnvBindings,
  type ResolvedBindingValue,
} from "@/server/services/secrets";

/**
 * Pure binding-projection logic (parity §3 secrets depth): versionSelector resolution + fanning
 * resolved bindings into env / file / inline_ref projections. No DB — these are the pure cores that
 * resolveEnvForAgent / resolveBindingsForAgent are built on.
 */
describe("selectBindingVersion + normalizeVersionSelector", () => {
  it("'latest' follows pinnedVersion ?? currentVersion", () => {
    expect(selectBindingVersion({ versionSelector: "latest", pinnedVersion: null }, 5)).toBe(5);
    expect(selectBindingVersion({ versionSelector: "latest", pinnedVersion: 2 }, 5)).toBe(2);
    // Legacy binding: no versionSelector at all → behaves exactly as before (pinnedVersion ?? current).
    expect(selectBindingVersion({ pinnedVersion: null }, 7)).toBe(7);
    expect(selectBindingVersion({ pinnedVersion: 3 }, 7)).toBe(3);
  });

  it("a numeric versionSelector pins that exact version and supersedes pinnedVersion", () => {
    expect(selectBindingVersion({ versionSelector: "1", pinnedVersion: 4 }, 9)).toBe(1);
    expect(selectBindingVersion({ versionSelector: "3" }, 9)).toBe(3);
  });

  it("normalizeVersionSelector collapses junk/empty to 'latest' and keeps positive integers", () => {
    expect(normalizeVersionSelector(undefined)).toBe("latest");
    expect(normalizeVersionSelector("")).toBe("latest");
    expect(normalizeVersionSelector("latest")).toBe("latest");
    expect(normalizeVersionSelector("0")).toBe("latest");
    expect(normalizeVersionSelector("-2")).toBe("latest");
    expect(normalizeVersionSelector("abc")).toBe("latest");
    expect(normalizeVersionSelector("4")).toBe("4");
  });
});

describe("projectResolvedBindings", () => {
  const v = (over: Partial<ResolvedBindingValue>): ResolvedBindingValue => ({
    envVarName: "K",
    configPath: null,
    projectionClass: "env",
    scope: "agent",
    value: "x",
    ...over,
  });

  it("splits by projection class, using configPath for file/inline_ref paths", () => {
    const proj = projectResolvedBindings([
      v({ envVarName: "API_KEY", projectionClass: "env", value: "sk-1" }),
      v({ projectionClass: "file", configPath: "certs/tls.pem", value: "PEM" }),
      v({ projectionClass: "inline_ref", configPath: "auth.token", value: "tok" }),
    ]);
    expect(proj.env).toEqual({ API_KEY: "sk-1" });
    expect(proj.files).toEqual([{ path: "certs/tls.pem", value: "PEM" }]);
    expect(proj.inlineRefs).toEqual([{ path: "auth.token", value: "tok" }]);
  });

  it("agent-scoped env wins over adapter/tool on the same var (precedence preserved)", () => {
    const proj = projectResolvedBindings([
      v({ envVarName: "TOKEN", scope: "adapter", value: "adapter-val" }),
      v({ envVarName: "TOKEN", scope: "tool_connection", value: "tool-val" }),
      v({ envVarName: "TOKEN", scope: "agent", value: "agent-val" }),
    ]);
    expect(proj.env).toEqual({ TOKEN: "agent-val" });
    // mergeEnvBindings keeps the same rule for the legacy env-only shape.
    expect(
      mergeEnvBindings([
        { envVarName: "TOKEN", value: "adapter-val", scope: "adapter" },
        { envVarName: "TOKEN", value: "agent-val", scope: "agent" },
      ]),
    ).toEqual({ TOKEN: "agent-val" });
  });
});

describe("type guards", () => {
  it("isProjectionClass / isSecretBindingScope accept the allowed values only", () => {
    expect(["env", "file", "inline_ref"].every(isProjectionClass)).toBe(true);
    expect(isProjectionClass("bogus")).toBe(false);
    expect(["agent", "adapter", "tool_connection"].every(isSecretBindingScope)).toBe(true);
    expect(isSecretBindingScope("nope")).toBe(false);
  });
});
