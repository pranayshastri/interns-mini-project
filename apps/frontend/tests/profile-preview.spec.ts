import { test, expect } from "@playwright/test";

test("account preview supports address review without persistent writes", async ({
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
  await page.goto("/profile-preview");
  await page.getByLabel("Full name").fill("Preview reviewer");
  await page.getByRole("button", { name: "Preview save", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Details updated" }),
  ).toContainText("reset on reload");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../../test-artifacts/frontend/profile-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /02 Saved addresses/ }).click();
  await page.getByRole("button", { name: "Add your first address" }).click();
  const dialog = page.getByRole("dialog");
  for (const [label, value] of Object.entries({
    "Address label": "Work",
    "Recipient name": "Preview reviewer",
    "Phone number": "+91 9000000000",
    "Address line 1": "Preview building",
    City: "Test city",
    "State / region": "Test region",
    "Postal code": "123456",
    Country: "India",
  })) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  await dialog.getByRole("button", { name: "Save preview address" }).click();
  await expect(
    page.getByText("Default delivery", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Work", exact: true }).click();
  await dialog.getByLabel("Address label").fill("Home");
  await dialog.getByRole("button", { name: "Save preview address" }).click();
  await page
    .getByRole("button", { name: "+ Add address", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Add address", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../test-artifacts/frontend/profile-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Delete Home", exact: true }).click();
  await dialog.getByRole("button", { name: "Keep address" }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete Home", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Delete address", exact: true })
    .click();
  await expect(page.getByText("Your address book starts here")).toBeVisible();
  await page.getByRole("button", { name: /01 Personal details/ }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Preview reviewer");
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("");
  expect(mutations).toEqual([]);
});
