import { test, expect } from "@playwright/test";

// A real user creating a project from the UI: open the modal from the Projects screen, fill the form,
// submit, and confirm both the success toast and that the new project shows up in the list. This is the
// "fill a form and see the result" flow the smoke suite deliberately does not cover.
//
// /projects is an always-present (unflagged) screen, so this runs in any environment. Each run uses a
// unique name so parallel workers and repeat runs on the shared dev DB never collide.
test("create a project from the UI", async ({ page }) => {
  const name = `E2E Project ${Date.now()}`;
  const description = "Created by the project-create e2e spec";

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

  // Open the create modal (header button is always present, even when the list is empty).
  await page.getByRole("button", { name: /new project/i }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("New Project", { exact: true })).toBeVisible();

  await dialog.getByPlaceholder("e.g., Website Redesign").fill(name);
  await dialog.getByPlaceholder(/optional project description/i).fill(description);

  await dialog.getByRole("button", { name: /create project/i }).click();

  // Success surfaces as a toast, and the list re-queries and shows the new project.
  await expect(page.getByText("Project created")).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
});

// The error state the happy path does not exercise: submitting with an empty name must show the
// validation message and keep the modal open (nothing created).
test("create-project form validates a required name", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: /new project/i }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("New Project", { exact: true })).toBeVisible();

  // Submit with the name left blank.
  await dialog.getByRole("button", { name: /create project/i }).click();

  await expect(dialog.getByText(/project name is required/i)).toBeVisible();
  // The modal stays open and no success toast appears.
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Project created")).toHaveCount(0);
});
