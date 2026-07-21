// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { App } from "../../src/App";
import { resetLocalDatabase } from "../../src/db/localDatabase";

const strongPassword = "GoXPlan1!";
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

beforeEach(async () => {
  window.history.replaceState(null, "", "/auth");
  window.localStorage.clear();
  await resetLocalDatabase();
});

afterEach(async () => {
  cleanup();
  window.localStorage.clear();
  await resetLocalDatabase();
});

describe("responsive layout smoke coverage", () => {
  test("keeps the CSS safeguards for compact screens and long forms", () => {
    expect(cssBlock(".modal-backdrop")).toContain("overflow: hidden");
    expect(cssBlock(".modal-panel")).toContain("max-height: calc(100dvh");
    expect(cssBlock(".modal-panel")).toContain("overflow: hidden");
    expect(cssBlock(".modal-panel")).toContain("width: min(100%, 560px)");
    expect(cssBlock(".modal-panel > form")).toContain("overflow-y: auto");

    const mobileShell = mediaBlock("@media (max-width: 900px)");
    expect(mobileShell).toContain(".app-frame");
    expect(mobileShell).toContain("grid-template-columns: 1fr");
    expect(mobileShell).toContain(".sidebar-nav");
    expect(mobileShell).toContain("overflow-x: auto");
    expect(mobileShell).toContain(".auth-shell");

    const compactRows = mediaBlock("@media (max-width: 720px)");
    expect(compactRows).toContain(".income-line");
    expect(compactRows).toContain(".payment-line");
    expect(compactRows).toContain(".payoff-payment-row");
    expect(compactRows).toContain(".payoff-order-row");

    const narrowControls = mediaBlock("@media (max-width: 620px)");
    expect(narrowControls).toContain(".debt-add-button");
    expect(narrowControls).toContain("width: 100%");

    const phoneRules = mediaBlock("@media (max-width: 520px)");
    expect(phoneRules).toContain(".form-actions");
    expect(phoneRules).toContain("flex-direction: column-reverse");
  });

  test("renders core pages and long dialogs at a phone-sized viewport", async () => {
    setViewport(390, 740);
    const user = userEvent.setup();
    render(<App />);

    await signup(user);
    await openDebtsWithSeedData(user);
    await openAndCloseDialog(user, "Add debt", "Add debt");

    await navigate(user, "Income", "Income", "/income");
    await openAndCloseDialog(user, "Add income", "Add income");

    await navigate(user, "Payments", "Payments", "/payments");
    await openAndCloseDialog(user, "Add payment", "Add payment");

    await navigate(user, "Payoff plan", "Payoff plan", "/payoff");
    expect(screen.getByText("Planner")).toBeTruthy();
  });

  test("renders auth and payment dialog at a short desktop viewport", async () => {
    setViewport(1180, 640);
    const user = userEvent.setup();
    render(<App />);

    await signup(user);
    await openDebtsWithSeedData(user);
    await navigate(user, "Payments", "Payments", "/payments");
    await openAndCloseDialog(user, "Add payment", "Add payment");
  });
});

async function signup(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { level: 1, name: "Login" });

  await user.click(screen.getByRole("button", { name: "Sign up" }));
  await user.type(screen.getByLabelText("First name"), "Responsive");
  await user.type(screen.getByLabelText("Last name"), "Tester");
  await user.type(screen.getByLabelText("Username"), "responsivetester");
  await user.type(screen.getByLabelText("Email"), "responsive@example.com");
  await user.type(screen.getByLabelText("Password"), strongPassword);
  await user.click(screen.getByRole("button", { name: "Create account" }));

  await expectHeading("Dashboard");
}

async function openDebtsWithSeedData(user: ReturnType<typeof userEvent.setup>) {
  await navigate(user, "Debts", "Debts", "/debts");
  await user.click(screen.getByRole("button", { name: "Import" }));
  await screen.findByRole("button", { name: "Auto Loan" });
  expect(screen.getByRole("button", { name: /^Debts\s+13$/ })).toBeTruthy();
}

async function navigate(user: ReturnType<typeof userEvent.setup>, navName: string, heading: string, path: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^${escapeRegExp(navName)}`) }));
  await expectHeading(heading);
  expect(window.location.pathname).toBe(path);
}

async function openAndCloseDialog(user: ReturnType<typeof userEvent.setup>, buttonName: string, dialogName: string) {
  await user.click(screen.getByRole("button", { name: buttonName }));
  const dialog = await screen.findByRole("dialog", { name: dialogName });
  expect(dialog).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
  });
}

async function expectHeading(name: string) {
  expect(await screen.findByRole("heading", { level: 1, name })).toBeTruthy();
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

function cssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`, "m").exec(styles);
  return match?.groups?.body ?? "";
}

function mediaBlock(query: string) {
  const start = styles.indexOf(query);
  if (start === -1) return "";
  const next = styles.indexOf("\n@media", start + query.length);
  return styles.slice(start, next === -1 ? undefined : next);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
