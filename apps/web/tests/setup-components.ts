import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Component-test setup (jsdom). Registers jest-dom matchers (toBeVisible, toHaveTextContent, …) and
// unmounts the React tree after every test so components don't leak DOM/state across cases.
afterEach(() => {
  cleanup();
});
