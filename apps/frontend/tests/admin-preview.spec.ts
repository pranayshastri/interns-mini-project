import { test, expect } from "@playwright/test";

test("admin design navigation and seller preview never perform administrative writes", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/graphql") &&
      request.postData()?.includes("mutation")
    )
      mutations.push(request.postData()!);
  });
  await page.goto("/admin-preview");
  await expect(
    page.getByRole("heading", { name: "Your platform, at a glance." }),
  ).toBeVisible();
  await expect(page.getByText("DESIGN PREVIEW", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manage your users" }).click();
  await page.getByRole("searchbox", { name: "Search users" }).fill("review");
  await page.getByLabel("Role", { exact: true }).selectOption("Admin");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search users" }),
  ).toHaveValue("");
  await expect(page.getByLabel("Role", { exact: true })).toHaveValue("all");
  await expect(
    page.getByRole("heading", { name: "User directory is not connected" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sellers & shops", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview seller setup" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Review only");
  await expect(
    page.getByRole("button", { name: "Create seller & shop" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview seller setup" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Platform health", exact: true })
    .click();
  await expect(page.getByText("Unknown", { exact: true })).toHaveCount(4);
  await page.getByRole("button", { name: "Activity log", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Audit history is not available yet" }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../test-artifacts/frontend/admin-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../../test-artifacts/frontend/admin-desktop.png",
    fullPage: true,
  });
});

test("admin workspace still requires authentication", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/login\?returnTo=%2Fadmin/);
  await expect(
    page.getByRole("heading", { name: "Your platform, at a glance." }),
  ).toHaveCount(0);
});
