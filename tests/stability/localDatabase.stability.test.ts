import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  createInMemoryDatabaseForTesting,
  deleteAccountMovement,
  deleteIncome,
  deletePayment,
  exportUserBackup,
  getBackupPreview,
  getPayoffSettings,
  importUserBackup,
  listAccountMovements,
  listDebts,
  listDebtSnapshots,
  listFinancialAccounts,
  listPayoffMilestones,
  listPayments,
  setDatabaseWriterForTesting,
  upsertAccountMovement,
  upsertDebt,
  upsertFinancialAccount,
  upsertIncome,
  upsertPayoffMilestone,
  upsertPayoffSettings,
  upsertPayment,
} from "../../src/db/localDatabase";
import { buildPayoffPlan, getPayoffRecommendationBudgetCents } from "../../src/features/payoff/PayoffPlanPage";
import { buildFinancialSummary } from "../../src/lib/financialSummary";
import { buildPayoffPeriodProgress } from "../../src/lib/payoffPeriods";
import type { AccountMovementInput, DebtInput, FinancialAccountInput, IncomeInput, PaymentInput } from "../../src/types";

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

  test("moves edited income deposits between destination accounts without leaving stale cash", async () => {
    const checking = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "100", name: "Checking" }));
    const savings = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "50", name: "Savings" }));

    const income = await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        accountId: "",
        destinationAccountId: checking.id,
        fees: "25",
        grossAmount: "500",
        sourceType: "OTHER",
      }),
    );

    expect(getAccount(checking.id).availableBalanceCents).toBe(57500);
    expect(getAccount(savings.id).availableBalanceCents).toBe(5000);

    await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        id: income.id,
        accountId: "",
        destinationAccountId: savings.id,
        fees: "10",
        grossAmount: "300",
        sourceType: "OTHER",
      }),
    );

    expect(getAccount(checking.id).availableBalanceCents).toBe(10000);
    expect(getAccount(savings.id).availableBalanceCents).toBe(34000);

    await deleteIncome(db, userId, income.id);

    expect(getAccount(checking.id).availableBalanceCents).toBe(10000);
    expect(getAccount(savings.id).availableBalanceCents).toBe(5000);
  });

  test("restores the original trading source when edited income switches source accounts", async () => {
    const firstTrading = await upsertFinancialAccount(
      db,
      userId,
      tradingAccountInput({ availableBalance: "2000", name: "First trading" }),
    );
    const secondTrading = await upsertFinancialAccount(
      db,
      userId,
      tradingAccountInput({ availableBalance: "1500", name: "Second trading" }),
    );

    const income = await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        accountId: firstTrading.id,
        grossAmount: "400",
        topstepAccountCount: "4",
        topstepProfitPerAccount: "2000",
      }),
    );

    expect(getAccount(firstTrading.id).tradingAccountProfitsCents).toEqual([160000, 160000, 160000, 160000]);
    expect(getAccount(secondTrading.id).tradingAccountProfitsCents).toEqual([150000, 150000, 150000, 150000]);

    await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        id: income.id,
        accountId: secondTrading.id,
        grossAmount: "300",
        topstepAccountCount: "4",
        topstepProfitPerAccount: "1500",
      }),
    );

    expect(getAccount(firstTrading.id).tradingAccountProfitsCents).toEqual([200000, 200000, 200000, 200000]);
    expect(getAccount(secondTrading.id).tradingAccountProfitsCents).toEqual([120000, 120000, 120000, 120000]);

    await deleteIncome(db, userId, income.id);

    expect(getAccount(firstTrading.id).tradingAccountProfitsCents).toEqual([200000, 200000, 200000, 200000]);
    expect(getAccount(secondTrading.id).tradingAccountProfitsCents).toEqual([150000, 150000, 150000, 150000]);
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

  test("moves edited payments between paid-from accounts without double charging cash", async () => {
    const checking = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "1000", name: "Checking" }));
    const savings = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "500", name: "Savings" }));
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", status: "COLLECTION" }));

    const payment = await upsertPayment(db, userId, paymentInput({ accountId: checking.id, amount: "250", debtId: debt.id }));
    expect(getAccount(checking.id).availableBalanceCents).toBe(75000);
    expect(getAccount(savings.id).availableBalanceCents).toBe(50000);

    await upsertPayment(db, userId, paymentInput({ id: payment.id, accountId: savings.id, amount: "125", debtId: debt.id }));
    expect(getAccount(checking.id).availableBalanceCents).toBe(100000);
    expect(getAccount(savings.id).availableBalanceCents).toBe(37500);

    await deletePayment(db, userId, payment.id);
    expect(getAccount(checking.id).availableBalanceCents).toBe(100000);
    expect(getAccount(savings.id).availableBalanceCents).toBe(50000);
  });

  test("rejects debt payments from trading accounts", async () => {
    const trading = await upsertFinancialAccount(db, userId, tradingAccountInput({ availableBalance: "1000" }));
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", status: "COLLECTION" }));

    await expect(upsertPayment(db, userId, paymentInput({ accountId: trading.id, amount: "200", debtId: debt.id }))).rejects.toThrow(
      "Choose a bank or cash account for debt payments.",
    );

    expect(getAccount(trading.id).availableBalanceCents).toBe(100000);
  });

  test("keeps linked cash accounts from being converted into trading accounts", async () => {
    const bank = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "1000", name: "Checking" }));
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", status: "COLLECTION" }));
    await upsertPayment(db, userId, paymentInput({ accountId: bank.id, amount: "200", debtId: debt.id }));

    await expect(
      upsertFinancialAccount(
        db,
        userId,
        tradingAccountInput({
          id: bank.id,
          name: "Checking",
        }),
      ),
    ).rejects.toThrow("Accounts used for cash deposits, payments, or transfers must stay bank/cash accounts.");

    expect(getAccount(bank.id)).toMatchObject({ accountType: "BANK", availableBalanceCents: 80000 });
  });

  test("restores cash account movements when transfers and adjustments are edited and deleted", async () => {
    const checking = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "1000", name: "Checking" }));
    const savings = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "100", name: "Savings" }));

    const transfer = await upsertAccountMovement(
      db,
      userId,
      accountMovementInput({ amount: "250", fromAccountId: checking.id, toAccountId: savings.id }),
    );

    expect(getAccount(checking.id).availableBalanceCents).toBe(75000);
    expect(getAccount(savings.id).availableBalanceCents).toBe(35000);

    await upsertAccountMovement(
      db,
      userId,
      accountMovementInput({ id: transfer.id, amount: "100", fromAccountId: checking.id, toAccountId: savings.id }),
    );

    expect(getAccount(checking.id).availableBalanceCents).toBe(90000);
    expect(getAccount(savings.id).availableBalanceCents).toBe(20000);

    await deleteAccountMovement(db, userId, transfer.id);
    expect(getAccount(checking.id).availableBalanceCents).toBe(100000);
    expect(getAccount(savings.id).availableBalanceCents).toBe(10000);

    const adjustment = await upsertAccountMovement(
      db,
      userId,
      accountMovementInput({ adjustmentAccountId: checking.id, amount: "50", movementType: "ADJUSTMENT" }),
    );
    expect(getAccount(checking.id).availableBalanceCents).toBe(105000);

    await upsertAccountMovement(
      db,
      userId,
      accountMovementInput({
        adjustmentAccountId: checking.id,
        adjustmentDirection: "DECREASE",
        amount: "25",
        id: adjustment.id,
        movementType: "ADJUSTMENT",
      }),
    );
    expect(getAccount(checking.id).availableBalanceCents).toBe(97500);
    expect(listAccountMovements(db, userId)).toHaveLength(1);

    await deleteAccountMovement(db, userId, adjustment.id);
    expect(getAccount(checking.id).availableBalanceCents).toBe(100000);
    expect(listAccountMovements(db, userId)).toHaveLength(0);
  });

  test("builds one financial summary across debts, cash, income, payments, and movements", async () => {
    const checking = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "1000", name: "Checking" }));
    const savings = await upsertFinancialAccount(db, userId, bankAccountInput({ availableBalance: "100", name: "Savings" }));
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", settlement: "400", status: "COLLECTION" }));
    const income = await upsertIncome(
      db,
      userId,
      tradingIncomeInput({
        accountId: "",
        destinationAccountId: checking.id,
        fees: "20",
        grossAmount: "200",
        sourceType: "OTHER",
      }),
    );

    await upsertPayment(db, userId, paymentInput({ accountId: checking.id, amount: "100", debtId: debt.id, resultingBalance: "900" }));
    await upsertAccountMovement(
      db,
      userId,
      accountMovementInput({ amount: "25", fromAccountId: checking.id, toAccountId: savings.id }),
    );
    await upsertAccountMovement(
      db,
      userId,
      accountMovementInput({ adjustmentAccountId: checking.id, amount: "50", movementType: "ADJUSTMENT" }),
    );

    const summary = buildFinancialSummary({
      accountMovements: listAccountMovements(db, userId),
      accounts: listFinancialAccounts(db, userId),
      debts: listDebts(db, userId),
      income: [income],
      negotiations: [],
      payments: listPayments(db, userId),
    });

    expect(summary.availableCashCents).toBe(123000);
    expect(summary.currentObligationsCents).toBe(30000);
    expect(summary.fullRemainingBalanceCents).toBe(90000);
    expect(summary.totalIncomeNetCents).toBe(18000);
    expect(summary.totalPaymentsCents).toBe(10000);
    expect(summary.accountMovementSummary).toMatchObject({
      adjustmentInCents: 5000,
      adjustmentOutCents: 0,
      transferVolumeCents: 2500,
    });
    expect(summary.netCashActivityCents).toBe(13000);
    expect(summary.possibleSettlementSavingsCents).toBe(50000);
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

  test("records debt balance snapshots and preserves them through backup import", async () => {
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", creditorName: "Snapshot debt", pastDue: "200", status: "PAST_DUE" }));
    await upsertDebt(
      db,
      userId,
      debtInput({ id: debt.id, balance: "900", creditorName: "Snapshot debt", pastDue: "150", status: "PAST_DUE" }),
    );
    await upsertPayment(db, userId, paymentInput({ amount: "100", debtId: debt.id, resultingBalance: "800" }));

    const snapshots = listDebtSnapshots(db, userId).filter((snapshot) => snapshot.debtId === debt.id);
    expect(snapshots.map((snapshot) => snapshot.reason).sort()).toEqual(["DEBT_CREATED", "DEBT_UPDATED", "PAYMENT_RECORDED"]);
    expect(snapshots.find((snapshot) => snapshot.reason === "PAYMENT_RECORDED")).toMatchObject({ balanceCents: 80000 });

    const backup = exportUserBackup(db, userId);
    expect(getBackupPreview(backup).counts.debtSnapshots).toBeGreaterThanOrEqual(3);

    const targetDb = createSeededDatabase();
    try {
      await importUserBackup(targetDb, userId, backup, "REPLACE");

      expect(listDebtSnapshots(targetDb, userId).filter((snapshot) => snapshot.debtId === debt.id)).toHaveLength(3);
    } finally {
      targetDb.close();
    }
  });

  test("adds correction snapshots when a balance-changing payment is edited or deleted", async () => {
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", creditorName: "Correction debt" }));
    const payment = await upsertPayment(db, userId, paymentInput({ amount: "100", debtId: debt.id, resultingBalance: "900" }));

    await upsertPayment(db, userId, paymentInput({ id: payment.id, amount: "150", debtId: debt.id, resultingBalance: "850" }));
    await deletePayment(db, userId, payment.id);

    const reasons = listDebtSnapshots(db, userId)
      .filter((snapshot) => snapshot.debtId === debt.id)
      .map((snapshot) => snapshot.reason);

    expect(reasons).toEqual(expect.arrayContaining(["PAYMENT_RECORDED", "PAYMENT_EDITED", "PAYMENT_DELETED"]));
    expect(listDebts(db, userId).find((item) => item.id === debt.id)?.balanceCents).toBe(100000);
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
    setBackupCell(backup, "debt_snapshots", "reason", "BAD_REASON");
    setBackupCell(backup, "payoff_settings", "strategy", "BAD_STRATEGY");
    setBackupCell(backup, "payoff_settings", "budget_frequency", "BAD_FREQUENCY");

    const targetDb = createSeededDatabase();
    try {
      await importUserBackup(targetDb, userId, backup, "REPLACE");

      expect(listDebts(targetDb, userId)[0]).toMatchObject({ category: "OTHER", status: "OPEN" });
      expect(listPayments(targetDb, userId)[0]).toMatchObject({ paymentType: "REGULAR" });
      expect(listDebtSnapshots(targetDb, userId).some((snapshot) => snapshot.reason === "DEBT_UPDATED")).toBe(true);
      expect(getPayoffSettings(targetDb, userId)).toMatchObject({ budgetFrequency: "MONTHLY", strategy: "HYBRID" });
    } finally {
      targetDb.close();
    }
  });

  test("rejects malformed backup values before replace can clear current data", async () => {
    await upsertDebt(db, userId, debtInput({ creditorName: "Keep this debt" }));

    const sourceDb = createSeededDatabase();
    try {
      await upsertDebt(sourceDb, userId, debtInput({ creditorName: "Malformed imported debt" }));
      const backup = exportUserBackup(sourceDb, userId);
      setBackupCell(backup, "debts", "creditor_name", { bad: true });

      expect(() => getBackupPreview(backup)).toThrow("unsupported value in creditor_name");
      await expect(importUserBackup(db, userId, backup, "REPLACE")).rejects.toThrow("unsupported value in creditor_name");
      expect(listDebts(db, userId).map((debt) => debt.creditorName)).toEqual(["Keep this debt"]);
    } finally {
      sourceDb.close();
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
    expect(weeklyPlan.estimatedPeriods).toBe(6);
    expect(weeklyPlan.estimatedMonths).toBe(6);

    const yearlyPlan = buildPayoffPlan(debts, [], 130000, "PRIORITY", null, {}, new Map());
    expect(yearlyPlan.estimatedPeriods).toBe(2);
    expect(yearlyPlan.estimatedMonths).toBe(2);
  });

  test("caps current payoff recommendations by safe available cash", () => {
    expect(getPayoffRecommendationBudgetCents({ periodRemainingCents: 50000, safeAvailableCashCents: 120000 })).toBe(50000);
    expect(getPayoffRecommendationBudgetCents({ periodRemainingCents: 50000, safeAvailableCashCents: 20000 })).toBe(20000);
    expect(getPayoffRecommendationBudgetCents({ periodRemainingCents: 50000, safeAvailableCashCents: -1000 })).toBe(0);
  });

  test("tracks manual payoff allocations separately from automatic budget allocation", async () => {
    const debts = [
      await upsertDebt(db, userId, debtInput({ balance: "500", creditorName: "First debt", priority: 1, priorityScore: 100 })),
      await upsertDebt(db, userId, debtInput({ balance: "500", creditorName: "Second debt", priority: 2, priorityScore: 80 })),
      await upsertDebt(db, userId, debtInput({ balance: "500", creditorName: "Third debt", priority: 3, priorityScore: 70 })),
    ];

    const plan = buildPayoffPlan(debts, [], 100000, "PRIORITY", 2, { [debts[1].id]: 50000 }, new Map());

    expect(plan.planDebts.map((debt) => debt.allocationCents)).toEqual([50000, 50000, 0]);
    expect(plan.allocatedCents).toBe(100000);
    expect(plan.autoAllocationCents).toBe(50000);
    expect(plan.manualAllocationCents).toBe(50000);
    expect(plan.remainingBudgetCents).toBe(0);
    expect(plan.isOverBudget).toBe(false);
  });

  test("keeps manual payoff allocations visible when they exceed the budget", async () => {
    const [debt] = [
      await upsertDebt(db, userId, debtInput({ balance: "1000", creditorName: "Manual debt", priority: 1, priorityScore: 100 })),
    ];

    const plan = buildPayoffPlan([debt], [], 50000, "PRIORITY", null, { [debt.id]: 70000 }, new Map());

    expect(plan.planDebts[0].allocationCents).toBe(70000);
    expect(plan.allocatedCents).toBe(70000);
    expect(plan.autoAllocationCents).toBe(0);
    expect(plan.manualAllocationCents).toBe(70000);
    expect(plan.remainingBudgetCents).toBe(-20000);
    expect(plan.isOverBudget).toBe(true);
  });

  test("tracks a weekly payoff goal from Sunday through Saturday and backs up the milestone", async () => {
    const debt = await upsertDebt(db, userId, debtInput({ balance: "1000", creditorName: "Weekly debt" }));
    await upsertPayoffSettings(db, userId, {
      budgetFrequency: "WEEKLY",
      emergencyReserve: "",
      manualAllocations: {},
      maxAccountsPerRound: "",
      monthlyBudget: "100",
      strategy: "PRIORITY",
    });
    await upsertPayment(db, userId, paymentInput({ amount: "100", debtId: debt.id, paidDate: "2026-07-22", resultingBalance: "900" }));

    const settings = getPayoffSettings(db, userId);
    const progress = buildPayoffPeriodProgress(settings.budgetFrequency, settings.monthlyBudgetCents, listPayments(db, userId), new Date("2026-07-23T12:00:00.000Z"));
    expect(progress).toMatchObject({
      isDone: true,
      paidCents: 10000,
      periodEnd: "2026-07-25",
      periodStart: "2026-07-19",
      targetCents: 10000,
    });

    await upsertPayoffMilestone(db, userId, progress);
    expect(listPayoffMilestones(db, userId)[0]).toMatchObject({
      budgetFrequency: "WEEKLY",
      paidCents: 10000,
      periodEnd: "2026-07-25",
      periodStart: "2026-07-19",
      status: "DONE",
      targetCents: 10000,
    });

    const backup = exportUserBackup(db, userId);
    expect(getBackupPreview(backup).counts.payoffMilestones).toBe(1);

    const targetDb = createSeededDatabase();
    try {
      await importUserBackup(targetDb, userId, backup, "REPLACE");
      expect(listPayoffMilestones(targetDb, userId)[0]).toMatchObject({
        periodStart: "2026-07-19",
        status: "DONE",
      });
    } finally {
      targetDb.close();
    }
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

function accountMovementInput(patch: Partial<AccountMovementInput> = {}): AccountMovementInput {
  return {
    adjustmentAccountId: "",
    adjustmentDirection: "INCREASE",
    amount: "100",
    fromAccountId: "",
    movementType: "TRANSFER",
    notes: "",
    occurredDate: "2026-07-20",
    toAccountId: "",
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
