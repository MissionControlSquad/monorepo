import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// WhenAdmin is the HUMAN-RBAC UI gate backed by buildbase workspace roles. Two behaviors matter:
//   - DORMANT (buildbase not provisioned): renders children ungated (server ctx.tenancy is the floor).
//   - PROVISIONED: delegates to the SDK <WhenWorkspaceRoles> with owner/admin roles.

const { readyRef } = vi.hoisted(() => ({ readyRef: { current: false } }));
vi.mock("@/components/providers/BuildbaseProvider", () => ({
  useBuildbaseReady: () => readyRef.current,
}));
// Stand in for the SDK gate so we can assert WhenAdmin delegates to it (and with which roles) when
// buildbase is provisioned, without pulling the real SDK into jsdom.
vi.mock("@buildbase/sdk/react", () => ({
  WhenWorkspaceRoles: ({ roles, children }: { roles: string[]; children: React.ReactNode }) => (
    <div data-testid="sdk-role-gate" data-roles={roles.join(",")}>
      {children}
    </div>
  ),
}));

import { WhenAdmin } from "@/components/auth/WhenAdmin";

beforeEach(() => {
  readyRef.current = false;
});

describe("<WhenAdmin /> (render)", () => {
  it("dormant: renders children ungated, WITHOUT the SDK role gate", () => {
    readyRef.current = false;
    render(
      <WhenAdmin>
        <span>admin-only action</span>
      </WhenAdmin>,
    );
    expect(screen.getByText("admin-only action")).toBeInTheDocument();
    expect(screen.queryByTestId("sdk-role-gate")).not.toBeInTheDocument();
  });

  it("provisioned: delegates to the SDK role gate with owner+admin roles", () => {
    readyRef.current = true;
    render(
      <WhenAdmin>
        <span>admin-only action</span>
      </WhenAdmin>,
    );
    const gate = screen.getByTestId("sdk-role-gate");
    expect(gate).toBeInTheDocument();
    // owner/admin are the manager tier — single-sourced from WORKSPACE_ROLES.
    expect(gate.getAttribute("data-roles")).toContain("owner");
    expect(gate.getAttribute("data-roles")).toContain("admin");
    expect(screen.getByText("admin-only action")).toBeInTheDocument();
  });
});
