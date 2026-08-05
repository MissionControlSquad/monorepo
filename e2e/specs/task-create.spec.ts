import { test, expect } from "@playwright/test";

// A real user creating a task from the global "New task" action in the nav rail: open the modal, fill
// the title + description, submit, and confirm the success toast. The rail button and this blank-task
// flow exist on every screen with no feature-flag gate, so this runs in any environment.
//
// Only title + description are required (priority defaults to Medium, project + assignees are optional),
// so this stays a focused form test and does not depend on seeded projects or agents.
test("create a task from the UI", async ({ page }) => {
  const title = `E2E Task ${Date.now()}`;

  await page.goto("/");

  // The nav rail exposes a global "New task" action (aria-label), available on every screen.
  await page.getByRole("button", { name: /new task/i }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("New Task", { exact: true })).toBeVisible();

  await dialog.getByPlaceholder(/write blog post about ai automation/i).fill(title);
  await dialog.getByPlaceholder(/describe what needs to be done/i).fill("Created by the task-create e2e spec.");

  await dialog.getByRole("button", { name: /create task/i }).click();

  await expect(page.getByText("Task created")).toBeVisible();
});

// Error state: submitting with the title and description blank must show both validation messages and
// keep the modal open (nothing created, no success toast).
test("create-task form validates required fields", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /new task/i }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("New Task", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: /create task/i }).click();

  await expect(dialog.getByText(/title is required/i)).toBeVisible();
  await expect(dialog.getByText(/description is required/i)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Task created")).toHaveCount(0);
});
