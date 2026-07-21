// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { App } from "../../src/App";
import { resetLocalDatabase } from "../../src/db/localDatabase";

const strongPassword = "GoXPlan1!";

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

describe("GoXPlan smoke flow", () => {
  test("signs up, navigates core pages, opens key dialogs, and survives a remount", async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await signup(user);
    await expectHeading("Dashboard");
    expect(window.location.pathname).toBe("/dashboard");

    await openDebtsWithSeedData(user);
    await openAndCloseDialog(user, "Add debt", "Add debt");

    await user.click(screen.getByRole("button", { name: "Auto Loan" }));
    await expectHeading("Debt detail");
    expect(window.location.pathname).toMatch(/^\/debts\/.+/);

    await navigate(user, "Accounts", "Accounts", "/accounts");
    await openAndCloseDialog(user, "Add account", "Add account");

    await navigate(user, "Income", "Income", "/income");
    await openAndCloseDialog(user, "Add income", "Add income");

    await navigate(user, "Negotiations", "Negotiations", "/negotiations");
    await openAndCloseDialog(user, "Add negotiation", "Add negotiation");

    await navigate(user, "Payments", "Payments", "/payments");
    await openAndCloseDialog(user, "Add payment", "Add payment");

    await navigate(user, "Payoff plan", "Payoff plan", "/payoff");
    expect(screen.getByText("Planner")).toBeTruthy();

    await navigate(user, "Reports", "Reports", "/reports");
    expect(screen.getByText("Financial snapshot")).toBeTruthy();

    await navigate(user, "Backup", "Backup", "/backup");
    expect(screen.getByText("Backup and restore")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Switch to (dark|light) theme/ }));
    expect(document.documentElement.dataset.theme).toMatch(/light|dark/);

    view.unmount();
    window.history.replaceState(null, "", "/dashboard");
    render(<App />);

    await expectHeading("Dashboard");
    expect(screen.getByText("13 debts tracked")).toBeTruthy();
  });
});

async function signup(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "Login" });

  await user.click(screen.getByRole("button", { name: "Sign up" }));
  await user.type(screen.getByLabelText("First name"), "Smoke");
  await user.type(screen.getByLabelText("Last name"), "Tester");
  await user.type(screen.getByLabelText("Username"), "smoketester");
  await user.type(screen.getByLabelText("Email"), "smoke@example.com");
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
