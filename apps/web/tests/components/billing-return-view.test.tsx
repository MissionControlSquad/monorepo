import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Control the query string useSearchParams() sees, per test.
const { queryRef } = vi.hoisted(() => ({ queryRef: { current: "" } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(queryRef.current),
}));
// next/link needs a router context we don't have in jsdom — render it as a plain anchor.
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { BillingReturnView } from "@/views/BillingReturnView";

function renderWith(query: string) {
  queryRef.current = query;
  return render(<BillingReturnView />);
}

describe("<BillingReturnView /> (render)", () => {
  it("renders the success confirmation + dashboard/usage links", () => {
    renderWith("status=success");
    expect(screen.getByRole("heading", { name: "Subscription updated" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "View usage" })).toHaveAttribute("href", "/usage");
  });

  it("renders the cancelled state + back-to-pricing", () => {
    renderWith("status=cancelled");
    expect(screen.getByRole("heading", { name: "Checkout cancelled" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("renders the neutral return state when no status is present", () => {
    renderWith("");
    expect(screen.getByRole("heading", { name: "Returned from checkout" })).toBeInTheDocument();
  });
});
