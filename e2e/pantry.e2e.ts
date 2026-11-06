import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

// Public, CI-only fixture; never a deployment credential.
const token = "replace-with-a-long-random-admin-token";

beforeEach(async ({ app }) => {
  const response = await fetch(`${app.baseUrl}/api/items/itm-coffee/link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ onHand: 1, rfidUid: null }),
  });

  expect(response.status).toBe(200);
});

test("unlock, adjust real stock, persist, and lock", async ({ app, screen, browser }) => {
  await app.open("/");
  await screen.getByLabel("Admin token").fill("invalid-fixture");
  await screen.getByRole("button", "Open pantry").tap();
  await expect(screen.getByRole("alert")).toContainText("valid bearer token");
  await screen.getByLabel("Admin token").fill(token);
  await screen.getByRole("button", "Open pantry").tap();
  const stock = browser.locator("#item-controls-itm-coffee output");
  await expect(stock).toHaveText("1");
  await screen.getByRole("button", "Add one bag of Coffee beans").tap();
  await expect(stock).toHaveText("2");
  await expect(browser.locator(".notice-success")).toContainText("Coffee beans restocked");
  await expect(browser.locator("#activity-view")).toContainText("Coffee beans");
  await app.open("/");
  await expect(stock).toHaveText("2");
  await screen.getByRole("button", "Remove one bag of Coffee beans").tap();
  await expect(stock).toHaveText("1");
  await expect(browser.locator(".shopping-pane")).toContainText("Coffee beans");
  await screen.getByRole("button", "Lock pantry dashboard").tap();
  await expect(screen.getByRole("heading", "Open your pantry")).toBeVisible();
  await app.open("/");
  await expect(screen.getByLabel("Admin token")).toBeVisible();
});

test("committed adjustment survives a failed refresh without a second write", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/");
  await screen.getByLabel("Admin token").fill(token);
  await screen.getByRole("button", "Open pantry").tap();
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("1");
  let fail = true;
  await browser.route("**/api/snapshot", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({ status: 503, json: { error: { message: "fixture outage" } } });
    } else {
      await route.continue();
    }
  });
  await screen.getByRole("button", "Add one bag of Coffee beans").tap();
  await expect(screen.getByRole("alert")).toContainText("The count was saved");
  await expect(browser.locator(".notice-success")).toContainText("Coffee beans restocked");
  await screen.getByRole("button", "Try again").tap();
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("2");
  await screen.getByRole("button", "Remove one bag of Coffee beans").tap();
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("1");
});

test("a late unauthorized response cannot lock a new session", async ({ app, screen, browser }) => {
  await app.open("/");
  await screen.getByLabel("Admin token").fill(token);
  await screen.getByRole("button", "Open pantry").tap();
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("1");
  let entered!: () => void;
  let release!: () => void;

  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });

  const resumed = new Promise<void>((resolve) => {
    release = resolve;
  });

  await browser.route("**/api/items/itm-coffee/adjust", async (route) => {
    entered();
    await resumed;
    await route.fulfill({ status: 401, json: { error: { message: "old session expired" } } });
  });
  await screen.getByRole("button", "Add one bag of Coffee beans").tap();
  await ready;
  await screen.getByRole("button", "Lock pantry dashboard").tap();
  await screen.getByLabel("Admin token").fill(token);
  await screen.getByRole("button", "Open pantry").tap();
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("1");
  const response = browser.waitForResponse("**/api/items/itm-coffee/adjust");
  release();
  await response;
  // A new browser action round trip lets the old response's microtasks settle.
  await screen.getByRole("button", "Link a tag").tap();
  await expect(screen.getByRole("dialog")).toBeVisible();
});

test("link a tag and correct stock atomically, retaining success if refresh fails", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/");
  await screen.getByLabel("Admin token").fill(token);
  await screen.getByRole("button", "Open pantry").tap();
  await screen.getByRole("button", "Link a tag").tap();
  await screen.getByLabel("Pantry item").selectOption("itm-coffee");
  await screen.getByLabel("Tag UID").fill("A1B2C3D4");
  await screen.getByLabel("On hand").fill("4");
  await browser.route("**/api/snapshot", async (route) => {
    await route.fulfill({ status: 503, json: { error: { message: "fixture outage" } } });
  });
  await screen.getByRole("button", "Save item").tap();
  await expect(screen.getByRole("alert")).toContainText("The link was saved");
  await expect(browser.locator(".notice-success")).toContainText("Coffee beans linked");
  await expect(screen.getByRole("dialog")).not.toBeVisible();
  await browser.unroute("**/api/snapshot");
  await screen.getByRole("button", "Try again").tap();
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("4");
  await app.open("/");
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("4");
  await expect(browser.locator(".inventory-list")).toContainText("A1B2C3D4");
});

test("a delayed refresh cannot replace newer stock", async ({ app, screen, browser }) => {
  await app.open("/");
  await screen.getByLabel("Admin token").fill(token);
  await screen.getByRole("button", "Open pantry").tap();
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("1");
  let calls = 0;

  let entered!: () => void;
  let release!: () => void;

  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });

  const resumed = new Promise<void>((resolve) => {
    release = resolve;
  });

  await browser.route("**/api/snapshot", async (route) => {
    calls += 1;

    if (calls === 1) {
      await route.fulfill({ status: 503, json: { error: { message: "fixture outage" } } });
    } else if (calls === 2) {
      const previous = await route.fetch();
      const body = await previous.text();
      entered();
      await resumed;
      await route.fulfill({ status: 200, contentType: "application/json", body });
    } else {
      await route.continue();
    }
  });
  await screen.getByRole("button", "Add one bag of Coffee beans").tap();
  await expect(screen.getByRole("alert")).toBeVisible();
  await screen.getByRole("button", "Try again").tap();
  await ready;

  try {
    await screen.getByRole("button", "Add one bag of Coffee beans").tap();
    await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("3");
  } finally {
    release();
  }

  await expect(browser.locator(".dashboard-notices")).not.toContainText("Refreshing pantry");
  await expect(browser.locator("#item-controls-itm-coffee output")).toHaveText("3");
  await screen.getByRole("button", "Link a tag").tap();
  await screen.getByLabel("Pantry item").selectOption("itm-coffee");
  await expect(screen.getByLabel("On hand")).toHaveValue("3");
});
