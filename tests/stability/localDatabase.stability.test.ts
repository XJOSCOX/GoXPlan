import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  createInMemoryDatabaseForTesting,
  deleteIncome,
  deletePayment,
  exportUserBackup,
  getBackupPreview,
  getPayoffSettings,
  importUserBackup,
  listDebts,
  listFinancialAccounts,
  listPayments,
  setDatabaseWriterForTesting,
  upsertDebt,
  upsertFinancialAccount,
  upsertIncome,
  upsertPayoffSettings,
  upsertPayment,
} from "../../src/db/localDatabase";
import { buildPayoffPlan } from "../../src/features/payoff/PayoffPlanPage";
import type { DebtInput, FinancialAccountInput, IncomeInput, PaymentInput } from "../../src/types";

const userId = "stability-user";

let SQL: SqlJsStatic;
let db: Database;

beforeAll(async () => {
  SQL = await initSqlJs({
    locateFile: (file) => `node_modules/sql.js/dist/${file}`,
  });
});

beforeEach(() => {
  setDatabaseWriterForTesting(async () => undefined);
  db = createSeededDatabase();
});

afterEach(() => {
  db.close();
  setDatabaseWriterForTesting();
});

describe("local database stability", () => {
  test("restores copied trading account profits when income is edited and deleted", async () => {
    const account = await upsertFinancialAccount(db, userId, tradingAccountInput({ availableBalance: "2000", copiedAccounts: true }));

    const income = await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        accountId: account.id,
        grossAmount: "500",
        topstepAccountCount: "4",
        topstepProfitPerAccount: "2000",
      }),
    );

    expect(getOnlyAccount().tradingAccountProfitsCents).toEqual([150000, 150000, 150000, 150000]);

    await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        id: income.id,
        accountId: account.id,
        grossAmount: "300",
        topstepAccountCount: "4",
        topstepProfitPerAccount: "2000",
      }),
    );

    expect(getOnlyAccount().tradingAccountProfitsCents).toEqual([170000, 170000, 170000, 170000]);

    await deleteIncome(db, userId, income.id);

    expect(getOnlyAccount().tradingAccountProfitsCents).toEqual([200000, 200000, 200000, 200000]);
  });

  test("moves trading payout cash into a destination account and restores it on edit and delete", async () => {
    const trading = await upsertFinancialAccount(db, userId, tradingAccountInput({ availableBalance: "2000", copiedAccounts: true }));
    const bank = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "100" }));

    const income = await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        accountId: trading.id,
        destinationAccountId: bank.id,
        grossAmount: "500",
        topstepAccountCount: "4",
      }),
    );

    expect(getAccount(trading.id).tradingAccountProfitsCents).toEqual([150000, 150000, 150000, 150000]);
    expect(getAccount(bank.id).availableBalanceCents).toBe(190000);

    await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        id: income.id,
        accountId: trading.id,
        destinationAccountId: bank.id,
        grossAmount: "300",
        topstepAccountCount: "4",
      }),
    );

    expect(getAccount(trading.id).tradingAccountProfitsCents).toEqual([170000, 170000, 170000, 170000]);
    expect(getAccount(bank.id).availableBalanceCents).toBe(118000);

    await deleteIncome(db, userId, income.id);

    expect(getAccount(trading.id).tradingAccountProfitsCents).toEqual([200000, 200000, 200000, 200000]);
    expect(getAccount(bank.id).availableBalanceCents).toBe(10000);
  });

  test("restores debt balance and status when a payment is edited and deleted", async () => {
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", status: "COLLECTION" }));

    const settlement = await upsertPayment(
      db,
      userId,
      paymentInput({
        amount: "400",
        debtId: debt.id,
        paymentType: "SETTLEMENT",
        updateDebtStatus: true,
      }),
    );

    expect(getOnlyDebt()).toMatchObject({ balanceCents: 0, status: "SETTLED" });

    await upsertPayment(
      db,
      userId,
      paymentInput({
        id: settlement.id,
        amount: "200",
        debtId: debt.id,
        paymentType: "REGULAR",
        resultingBalance: "800",
        updateDebtStatus: false,
      }),
    );

    expect(getOnlyDebt()).toMatchObject({ balanceCents: 80000, status: "COLLECTION" });

    await deletePayment(db, userId, settlement.id);

    expect(getOnlyDebt()).toMatchObject({ balanceCents: 100000, status: "COLLECTION" });
  });

  test("deducts payment cash from the selected account and restores it on edit and delete", async () => {
    const bank = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "1000" }));
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", status: "COLLECTION" }));

    const payment = await upsertPayment(db, userId, paymentInput({ accountId: bank.id, amount: "200", debtId: debt.id }));
    expect(getAccount(bank.id).availableBalanceCents).toBe(80000);

    await upsertPayment(db, userId, paymentInput({ id: payment.id, accountId: bank.id, amount: "150", debtId: debt.id }));
    expect(getAccount(bank.id).availableBalanceCents).toBe(85000);

    await deletePayment(db, userId, payment.id);
    expect(getAccount(bank.id).availableBalanceCents).toBe(100000);
  });

  test("previews backup counts and rejects invalid backup shapes", async () => {
    const debt = await upsertDebt(db, userId, debtInput({ creditorName: "Preview debt" }));
    await upsertPayment(db, userId, paymentInput({ amount: "100", debtId: debt.id, resultingBalance: "900" }));

    const backup = exportUserBackup(db, userId);
    expect(getBackupPreview(backup).counts).toMatchObject({
      accounts: 0,
      debts: 1,
      income: 0,
      negotiations: 0,
      payments: 1,
      payoffSettings: 0,
    });

    expect(() => getBackupPreview({ app: "GoXPlan", version: 1 })).toThrow("This backup file does not look like a GoXPlan backup.");
    expect(() =>
      getBackupPreview({
        ...backup,
        tables: {
          ...backup.tables,
          debts: { columns: ["wrong"], rows: [] },
        },
      }),
    ).toThrow("debts backup section uses columns this app version cannot restore");
  });

  test("previews newer backup coverage details", async () => {
    const account = await upsertFinancialAccount(db, userId, tradingAccountInput({ tradingAccountProfits: ["2000", "2000", "2000", "2000"] }));
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", creditorName: "Covered debt" }));
    await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        accountId: account.id,
        grossAmount: "250",
        topstepAccountCount: "4",
        topstepProfitPerAccount: "2000",
      }),
    );
    await upsertPayment(db, userId, paymentInput({ amount: "100", debtId: debt.id, resultingBalance: "900" }));
    await upsertPayoffSettings(db, userId, {
      budgetFrequency: "YEARLY",
      emergencyReserve: "",
      manualAllocations: {},
      maxAccountsPerRound: "",
      monthlyBudget: "7200",
      strategy: "PRIORITY",
    });

    const preview = getBackupPreview(exportUserBackup(db, userId));

    expect(preview.details).toMatchObject({
      paymentSnapshots: 1,
      payoffFrequencies: ["YEARLY"],
      tradingAccounts: 1,
      tradingIncome: 1,
    });
  });

  test("imports legacy payment backups without balance snapshot columns", async () => {
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", creditorName: "Legacy debt" }));
    await upsertPayment(
      db,
      userId,
      paymentInput({
        amount: "250",
        debtId: debt.id,
        paymentType: "SETTLEMENT",
        updateDebtStatus: true,
      }),
    );

    const legacyBackup = exportUserBackup(db, userId);
    removePaymentColumn(legacyBackup, "debt_status_before");
    removePaymentColumn(legacyBackup, "debt_status_after");
    removePaymentColumn(legacyBackup, "debt_balance_before_cents");
    removePaymentColumn(legacyBackup, "debt_balance_after_cents");

    const targetDb = createSeededDatabase();
    try {
      const summary = await importUserBackup(targetDb, userId, legacyBackup, "MERGE");

      expect(summary.counts.payments).toBe(1);
      expect(listDebts(targetDb, userId)).toHaveLength(1);
      expect(listPayments(targetDb, userId)).toHaveLength(1);
    } finally {
      targetDb.close();
    }
  });

  test("merge keeps existing records while replace clears records missing from the backup", async () => {
    await upsertDebt(db, userId, debtInput({ creditorName: "Existing debt" }));

    const sourceDb = createSeededDatabase();
    try {
      await upsertDebt(sourceDb, userId, debtInput({ creditorName: "Imported debt" }));
      const backup = exportUserBackup(sourceDb, userId);

      await importUserBackup(db, userId, backup, "MERGE");
      expect(listDebts(db, userId).map((debt) => debt.creditorName).sort()).toEqual(["Existing debt", "Imported debt"]);

      await importUserBackup(db, userId, backup, "REPLACE");
      expect(listDebts(db, userId).map((debt) => debt.creditorName)).toEqual(["Imported debt"]);
    } finally {
      sourceDb.close();
    }
  });

  test("saves payoff budget frequency and preserves it through backup import", async () => {
    await upsertPayoffSettings(db, userId, {
      budgetFrequency: "WEEKLY",
      emergencyReserve: "100",
      manualAllocations: {},
      maxAccountsPerRound: "2",
      monthlyBudget: "250",
      strategy: "PRIORITY",
    });

    expect(getPayoffSettings(db, userId)).toMatchObject({
      budgetFrequency: "WEEKLY",
      emergencyReserveCents: 10000,
      maxAccountsPerRound: 2,
      monthlyBudgetCents: 25000,
      strategy: "PRIORITY",
    });

    const backup = exportUserBackup(db, userId);
    const targetDb = createSeededDatabase();
    try {
      await importUserBackup(targetDb, userId, backup, "REPLACE");

      expect(getPayoffSettings(targetDb, userId)).toMatchObject({
        budgetFrequency: "WEEKLY",
        emergencyReserveCents: 10000,
        maxAccountsPerRound: 2,
        monthlyBudgetCents: 25000,
        strategy: "PRIORITY",
      });
    } finally {
      targetDb.close();
    }
  });

  test("normalizes unsafe enum values during backup import", async () => {
    const debt = await upsertDebt(db, userId, debtInput({ creditorName: "Unsafe enum debt" }));
    await upsertPayment(db, userId, paymentInput({ amount: "100", debtId: debt.id, resultingBalance: "900" }));
    await upsertPayoffSettings(db, userId, {
      budgetFrequency: "WEEKLY",
      emergencyReserve: "",
      manualAllocations: {},
      maxAccountsPerRound: "",
      monthlyBudget: "100",
      strategy: "PRIORITY",
    });

    const backup = exportUserBackup(db, userId);
    setBackupCell(backup, "debts", "category", "BAD_CATEGORY");
    setBackupCell(backup, "debts", "status", "BAD_STATUS");
    setBackupCell(backup, "payments", "payment_type", "BAD_PAYMENT");
    setBackupCell(backup, "payoff_settings", "strategy", "BAD_STRATEGY");
    setBackupCell(backup, "payoff_settings", "budget_frequency", "BAD_FREQUENCY");

    const targetDb = createSeededDatabase();
    try {
      await importUserBackup(targetDb, userId, backup, "REPLACE");

      expect(listDebts(targetDb, userId)[0]).toMatchObject({ category: "OTHER", status: "OPEN" });
      expect(listPayments(targetDb, userId)[0]).toMatchObject({ paymentType: "REGULAR" });
      expect(getPayoffSettings(targetDb, userId)).toMatchObject({ budgetFrequency: "MONTHLY", strategy: "HYBRID" });
    } finally {
      targetDb.close();
    }
  });

  test("uses the entered budget as the current weekly monthly or yearly plan period", async () => {
    const debts = [
      await upsertDebt(db, userId, debtInput({ balance: "1000", creditorName: "First debt", priority: 1, priorityScore: 100 })),
      await upsertDebt(db, userId, debtInput({ balance: "300", creditorName: "Second debt", priority: 2, priorityScore: 80 })),
    ];

    expect(getAllocatedAmounts(debts, 25000)).toEqual([25000, 0]);
    expect(getAllocatedAmounts(debts, 100000)).toEqual([100000, 0]);
    expect(getAllocatedAmounts(debts, 130000)).toEqual([100000, 30000]);

    const weeklyPlan = buildPayoffPlan(debts, [], 25000, "PRIORITY", null, {}, new Map());
    expect(weeklyPlan.estimatedMonths).toBe(6);

    const yearlyPlan = buildPayoffPlan(debts, [], 130000, "PRIORITY", null, {}, new Map());
    expect(yearlyPlan.estimatedMonths).toBe(2);
  });
});

function createSeededDatabase() {
  const nextDb = createInMemoryDatabaseForTesting(SQL);
  nextDb.run(
    `
      INSERT INTO users (id, first_name, last_name, username, email, password_hash, password_salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [userId, "Test", "User", "testuser", "test@example.com", "hash", "salt", "2026-07-20T12:00:00.000Z", "2026-07-20T12:00:00.000Z"],
  );
  return nextDb;
}

function getOnlyAccount() {
  const accounts = listFinancialAccounts(db, userId);
  expect(accounts).toHaveLength(1);
  return accounts[0];
}

function getAccount(accountId: string) {
  const account = listFinancialAccounts(db, userId).find((item) => item.id === accountId);
  expect(account).toBeDefined();
  return account!;
}

function getOnlyDebt() {
  const debts = listDebts(db, userId);
  expect(debts).toHaveLength(1);
  return debts[0];
}

function tradingAccountInput(patch: Partial<FinancialAccountInput> = {}): FinancialAccountInput {
  return {
    accountType: "TRADING",
    availableBalance: "2000",
    copiedAccounts: true,
    feePercent: "10",
    institution: "Topstep",
    maxSubAccounts: "4",
    name: "Topstep 50k",
    notes: "",
    payoutLimitPercent: "50",
    tradingAccountProfits: ["", "", "", "", ""],
    ...patch,
  };
}

function bankAccountInput(patch: Partial<FinancialAccountInput> = {}): FinancialAccountInput {
  return {
    accountType: "BANK",
    availableBalance: "0",
    copiedAccounts: false,
    feePercent: "",
    institution: "Test Bank",
    maxSubAccounts: "",
    name: "Checking",
    notes: "",
    payoutLimitPercent: "",
    tradingAccountProfits: ["", "", "", "", ""],
    ...patch,
  };
}

function tradingIncomeInput(patch: Partial<IncomeInput> = {}): IncomeInput {
  return {
    accountId: "",
    destinationAccountId: "",
    allocatedAmount: "",
    fees: "",
    grossAmount: "500",
    notes: "",
    receivedDate: "2026-07-20",
    source: "Topstep payout",
    sourceType: "TOPSTEP",
    taxWithholding: "",
    topstepAccountCount: "4",
    topstepCopiedAccounts: true,
    topstepPayoutScope: "ALL_ACCOUNTS",
    topstepProfitPerAccount: "2000",
    topstepSelectedAccount: "1",
    ...patch,
  };
}

function debtInput(patch: Partial<DebtInput> = {}): DebtInput {
  return {
    apr: "",
    balance: "1000",
    category: "CREDIT_CARD",
    creditorName: "Test debt",
    minimumPayment: "",
    monthsBehind: "",
    negotiable: true,
    notes: "",
    pastDue: "",
    payForDelete: false,
    priority: 1,
    priorityScore: 75,
    reason: "Regression check",
    reported: false,
    settlement: "",
    settlementExpiresDate: "",
    status: "COLLECTION",
    targetDate: "",
    trackedDate: "2026-07-20",
    ...patch,
  };
}

function paymentInput(patch: Partial<PaymentInput> = {}): PaymentInput {
  return {
    accountId: "",
    amount: "100",
    confirmationNumber: "",
    debtId: "",
    interestAndFees: "",
    notes: "",
    paidDate: "2026-07-20",
    paymentMethod: "",
    paymentType: "REGULAR",
    principal: "",
    resultingBalance: "",
    updateDebtStatus: false,
    ...patch,
  };
}

function removePaymentColumn(backup: ReturnType<typeof exportUserBackup>, columnName: string) {
  const index = backup.tables.payments.columns.indexOf(columnName);
  if (index === -1) return;
  backup.tables.payments.columns.splice(index, 1);
  backup.tables.payments.rows = backup.tables.payments.rows.map((row) => row.filter((_, rowIndex) => rowIndex !== index));
}

function setBackupCell(
  backup: ReturnType<typeof exportUserBackup>,
  tableName: keyof ReturnType<typeof exportUserBackup>["tables"],
  columnName: string,
  value: unknown,
) {
  const columnIndex = backup.tables[tableName].columns.indexOf(columnName);
  expect(columnIndex).toBeGreaterThanOrEqual(0);
  expect(backup.tables[tableName].rows.length).toBeGreaterThan(0);
  backup.tables[tableName].rows[0][columnIndex] = value;
}

function getAllocatedAmounts(debts: Awaited<ReturnType<typeof upsertDebt>>[], periodBudgetCents: number) {
  return buildPayoffPlan(debts, [], periodBudgetCents, "PRIORITY", null, {}, new Map()).planDebts.map((debt) => debt.allocationCents);
}
