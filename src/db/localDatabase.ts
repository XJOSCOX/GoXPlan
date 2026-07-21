import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { hashPassword } from "../lib/crypto";
import type {
  AccountMovement,
  AccountMovementInput,
  AccountMovementType,
  DashboardStats,
  Debt,
  DebtCategory,
  DebtInput,
  DebtSnapshot,
  DebtSnapshotReason,
  DebtStatus,
  FinancialAccount,
  FinancialAccountInput,
  FinancialAccountType,
  Income,
  IncomeInput,
  IncomeSourceType,
  LoginInput,
  Negotiation,
  NegotiationContactMethod,
  NegotiationInput,
  NegotiationStatus,
  Payment,
  PaymentInput,
  PaymentType,
  PayoffMilestone,
  PayoffMilestoneInput,
  PayoffMilestoneStatus,
  PayoffSettings,
  PayoffBudgetFrequency,
  PayoffSettingsInput,
  PayoffStrategy,
  PublicUser,
  SignupInput,
  TopstepPayoutScope,
} from "../types";

const idbName = "GoXPlanLocalSql";
const idbStore = "database";
const idbKey = "main";
const sessionKey = "goxplan.session.userId";

let sqlPromise: Promise<SqlJsStatic> | undefined;
let databaseWriter: (bytes: Uint8Array) => Promise<void> = writeDatabaseBytes;

type StoredUser = PublicUser & {
  passwordHash: string;
  passwordSalt: string;
};

const backupTables = {
  financial_accounts: [
    "id",
    "user_id",
    "name",
    "account_type",
    "institution",
    "available_balance_cents",
    "max_sub_accounts",
    "copied_accounts",
    "trading_account_profits_cents",
    "payout_limit_basis_points",
    "fee_basis_points",
    "notes",
    "created_at",
    "updated_at",
  ],
  account_movements: [
    "id",
    "user_id",
    "movement_type",
    "from_account_id",
    "to_account_id",
    "amount_cents",
    "occurred_at",
    "notes",
    "created_at",
    "updated_at",
  ],
  debts: [
    "id",
    "user_id",
    "priority",
    "priority_score",
    "tracked_at",
    "creditor_name",
    "category",
    "balance_cents",
    "settlement_cents",
    "past_due_cents",
    "apr_basis_points",
    "minimum_payment_cents",
    "months_behind",
    "target_date",
    "settlement_expires_at",
    "status",
    "reported",
    "pay_for_delete",
    "negotiable",
    "reason",
    "notes",
    "created_at",
    "updated_at",
  ],
  debt_snapshots: [
    "id",
    "user_id",
    "debt_id",
    "creditor_name",
    "balance_cents",
    "obligation_cents",
    "status",
    "reason",
    "source_id",
    "snapshot_at",
    "notes",
    "created_at",
    "updated_at",
  ],
  income: [
    "id",
    "user_id",
    "account_id",
    "destination_account_id",
    "source",
    "source_type",
    "amount_cents",
    "gross_amount_cents",
    "fees_cents",
    "tax_withholding_cents",
    "net_amount_cents",
    "allocated_amount_cents",
    "topstep_account_count",
    "topstep_copied_accounts",
    "topstep_payout_scope",
    "topstep_selected_account",
    "topstep_profit_per_account_cents",
    "topstep_total_profit_cents",
    "topstep_withdrawable_cents",
    "topstep_fee_cents",
    "received_at",
    "notes",
    "created_at",
    "updated_at",
  ],
  negotiations: [
    "id",
    "user_id",
    "debt_id",
    "contact_date",
    "contact_method",
    "representative",
    "phone_or_portal",
    "balance_cents",
    "current_offer_cents",
    "user_offer_cents",
    "counter_offer_cents",
    "final_agreement_cents",
    "number_of_payments",
    "due_date",
    "written_agreement_received",
    "pay_for_delete_included",
    "offer_expires_at",
    "follow_up_at",
    "status",
    "notes",
    "created_at",
    "updated_at",
  ],
  payments: [
    "id",
    "user_id",
    "debt_id",
    "account_id",
    "payment_type",
    "amount_cents",
    "principal_cents",
    "interest_and_fees_cents",
    "resulting_balance_cents",
    "confirmation_number",
    "payment_method",
    "debt_status_before",
    "debt_status_after",
    "debt_balance_before_cents",
    "debt_balance_after_cents",
    "paid_at",
    "notes",
    "created_at",
    "updated_at",
  ],
  payoff_settings: [
    "user_id",
    "monthly_budget_cents",
    "budget_frequency",
    "emergency_reserve_cents",
    "max_accounts_per_round",
    "manual_allocations_json",
    "strategy",
    "updated_at",
  ],
  payoff_milestones: [
    "id",
    "user_id",
    "budget_frequency",
    "period_start",
    "period_end",
    "target_cents",
    "paid_cents",
    "status",
    "completed_at",
    "created_at",
    "updated_at",
  ],
} as const;

const backupTableNames = Object.keys(backupTables) as BackupTableName[];
const backupImportOrder: BackupTableName[] = [
  "financial_accounts",
  "account_movements",
  "debts",
  "debt_snapshots",
  "income",
  "negotiations",
  "payments",
  "payoff_settings",
  "payoff_milestones",
];
const backupDeleteOrder: BackupTableName[] = [
  "payoff_milestones",
  "payments",
  "negotiations",
  "income",
  "account_movements",
  "payoff_settings",
  "debt_snapshots",
  "debts",
  "financial_accounts",
];

type BackupTableName = keyof typeof backupTables;
type BackupTable = {
  columns: string[];
  rows: unknown[][];
};

export type BackupImportMode = "MERGE" | "REPLACE";

export type BackupRecordCounts = {
  accounts: number;
  accountMovements: number;
  debts: number;
  debtSnapshots: number;
  income: number;
  negotiations: number;
  payments: number;
  payoffMilestones: number;
  payoffSettings: number;
};

export type BackupPreview = {
  counts: BackupRecordCounts;
  details: {
    paymentSnapshots: number;
    payoffFrequencies: PayoffBudgetFrequency[];
    tradingAccounts: number;
    tradingIncome: number;
  };
  exportedAt: string;
  version: number;
};

export type BackupImportSummary = {
  counts: BackupRecordCounts;
  importedAt: string;
  mode: BackupImportMode;
};

export type GoXPlanBackup = {
  app: "GoXPlan";
  exportedAt: string;
  tables: Record<BackupTableName, BackupTable>;
  version: 1;
};

export async function openDatabase() {
  const SQL = await getSql();
  const bytes = await readDatabaseBytes();
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  initializeDatabase(db);
  await saveDatabase(db);
  return db;
}

export function createInMemoryDatabaseForTesting(SQL: SqlJsStatic) {
  const db = new SQL.Database();
  initializeDatabase(db);
  return db;
}

export function setDatabaseWriterForTesting(writer?: (bytes: Uint8Array) => Promise<void>) {
  databaseWriter = writer ?? writeDatabaseBytes;
}

function initializeDatabase(db: Database) {
  db.run(schema);
  ensureDebtColumns(db);
  ensureFinancialAccountColumns(db);
  ensureIncomeColumns(db);
  ensureNegotiationColumns(db);
  ensurePaymentColumns(db);
  ensurePayoffSettingsColumns(db);
}

export async function saveDatabase(db: Database) {
  await databaseWriter(db.export());
}

export function getSessionUserId() {
  return localStorage.getItem(sessionKey);
}

export function setSessionUserId(userId: string) {
  localStorage.setItem(sessionKey, userId);
}

export function clearSessionUserId() {
  localStorage.removeItem(sessionKey);
}

export async function resetLocalDatabase() {
  clearSessionUserId();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(idbName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export function findUserById(db: Database, userId: string) {
  return firstUser(
    db.exec(
      `
        SELECT id, first_name, last_name, username, email, password_hash, password_salt, created_at, updated_at
        FROM users
        WHERE id = ?
      `,
      [userId],
    ),
  );
}

export function findUserByLogin(db: Database, login: string) {
  const cleanLogin = login.trim().toLowerCase();
  return firstUser(
    db.exec(
      `
        SELECT id, first_name, last_name, username, email, password_hash, password_salt, created_at, updated_at
        FROM users
        WHERE lower(username) = ? OR lower(email) = ?
      `,
      [cleanLogin, cleanLogin],
    ),
  );
}

export async function upsertUser(db: Database, input: SignupInput) {
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const existing = findUserByLogin(db, username) ?? findUserByLogin(db, email);
  const now = new Date().toISOString();
  const password = await hashPassword(input.password, existing?.passwordSalt);
  const userId = existing?.id ?? crypto.randomUUID();

  db.run(
    `
      INSERT INTO users (
        id, first_name, last_name, username, email, password_hash, password_salt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        username = excluded.username,
        email = excluded.email,
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        updated_at = excluded.updated_at
    `,
    [
      userId,
      input.firstName.trim(),
      input.lastName.trim(),
      username,
      email,
      password.hash,
      password.salt,
      existing?.createdAt ?? now,
      now,
    ],
  );

  await saveDatabase(db);
  return toPublicUser(findUserById(db, userId)!);
}

export async function loginUser(db: Database, input: LoginInput) {
  const user = findUserByLogin(db, input.login);
  if (!user) throw new Error("No account matches that username or email.");

  const password = await hashPassword(input.password, user.passwordSalt);
  if (password.hash !== user.passwordHash) {
    throw new Error("Password is incorrect.");
  }

  return toPublicUser(user);
}

export function getDashboardStats(db: Database, userId: string): DashboardStats {
  const result = db.exec(
    `
      SELECT
        (SELECT COUNT(*) FROM debts WHERE user_id = ?) AS debts,
        (SELECT COUNT(*) FROM income WHERE user_id = ?) AS income,
        (SELECT COUNT(*) FROM payments WHERE user_id = ?) AS payments,
        (SELECT COUNT(*) FROM negotiations WHERE user_id = ?) AS negotiations
    `,
    [userId, userId, userId, userId],
  );
  const row = result[0]?.values[0] ?? [0, 0, 0];
  return { debts: Number(row[0]), income: Number(row[1]), payments: Number(row[2]), negotiations: Number(row[3] ?? 0) };
}

export function listDebts(db: Database, userId: string): Debt[] {
  const result = db.exec(
    `
      SELECT
        id, user_id, priority, priority_score, tracked_at, creditor_name, balance_cents, settlement_cents, status,
        reported, reason, notes, created_at, updated_at, category, apr_basis_points, minimum_payment_cents,
        months_behind, target_date, settlement_expires_at, pay_for_delete, negotiable, past_due_cents
      FROM debts
      WHERE user_id = ?
      ORDER BY priority ASC, priority_score DESC, updated_at DESC
    `,
    [userId],
  );

  return (result[0]?.values ?? []).map(toDebt);
}

export function listDebtSnapshots(db: Database, userId: string): DebtSnapshot[] {
  const result = db.exec(
    `
      SELECT id, user_id, debt_id, creditor_name, balance_cents, obligation_cents, status, reason, source_id,
        snapshot_at, notes, created_at, updated_at
      FROM debt_snapshots
      WHERE user_id = ?
      ORDER BY snapshot_at DESC, created_at DESC
    `,
    [userId],
  );

  return (result[0]?.values ?? []).map(toDebtSnapshot);
}

export function listIncome(db: Database, userId: string): Income[] {
  const result = db.exec(
    `
      SELECT income.id, income.user_id, income.source, income.amount_cents, income.received_at, income.notes, income.created_at, income.updated_at
        , income.source_type, income.gross_amount_cents, income.fees_cents, income.tax_withholding_cents, income.net_amount_cents, income.allocated_amount_cents,
        income.topstep_account_count, income.topstep_copied_accounts, income.topstep_payout_scope, income.topstep_selected_account,
        income.topstep_profit_per_account_cents, income.topstep_total_profit_cents, income.topstep_withdrawable_cents, income.topstep_fee_cents,
        income.account_id, source_account.name, source_account.account_type,
        income.destination_account_id, destination_account.name, destination_account.account_type
      FROM income
      LEFT JOIN financial_accounts AS source_account ON source_account.id = income.account_id AND source_account.user_id = income.user_id
      LEFT JOIN financial_accounts AS destination_account ON destination_account.id = income.destination_account_id AND destination_account.user_id = income.user_id
      WHERE income.user_id = ?
      ORDER BY income.received_at DESC, income.updated_at DESC
    `,
    [userId],
  );

  return (result[0]?.values ?? []).map(toIncome);
}

export function listFinancialAccounts(db: Database, userId: string): FinancialAccount[] {
  const result = db.exec(
    `
      SELECT id, user_id, name, account_type, institution, available_balance_cents, max_sub_accounts, copied_accounts,
        trading_account_profits_cents, payout_limit_basis_points, fee_basis_points, notes, created_at, updated_at
      FROM financial_accounts
      WHERE user_id = ?
      ORDER BY account_type DESC, name ASC
    `,
    [userId],
  );

  return (result[0]?.values ?? []).map(toFinancialAccount);
}

export function listAccountMovements(db: Database, userId: string): AccountMovement[] {
  const result = db.exec(
    `
      SELECT
        account_movements.id, account_movements.user_id, account_movements.movement_type,
        account_movements.from_account_id, from_account.name, from_account.account_type,
        account_movements.to_account_id, to_account.name, to_account.account_type,
        account_movements.amount_cents, account_movements.occurred_at, account_movements.notes,
        account_movements.created_at, account_movements.updated_at
      FROM account_movements
      LEFT JOIN financial_accounts AS from_account ON from_account.id = account_movements.from_account_id AND from_account.user_id = account_movements.user_id
      LEFT JOIN financial_accounts AS to_account ON to_account.id = account_movements.to_account_id AND to_account.user_id = account_movements.user_id
      WHERE account_movements.user_id = ?
      ORDER BY account_movements.occurred_at DESC, account_movements.updated_at DESC
    `,
    [userId],
  );

  return (result[0]?.values ?? []).map(toAccountMovement);
}

export function listPayments(db: Database, userId: string): Payment[] {
  const result = db.exec(
    `
      SELECT
        payments.id, payments.user_id, payments.debt_id, debts.creditor_name, payments.amount_cents,
        payments.paid_at, payments.notes, payments.created_at, payments.updated_at,
        payments.payment_type, payments.principal_cents, payments.interest_and_fees_cents,
        payments.resulting_balance_cents, payments.confirmation_number, payments.payment_method,
        payments.account_id, financial_accounts.name, financial_accounts.account_type
      FROM payments
      LEFT JOIN debts ON debts.id = payments.debt_id AND debts.user_id = payments.user_id
      LEFT JOIN financial_accounts ON financial_accounts.id = payments.account_id AND financial_accounts.user_id = payments.user_id
      WHERE payments.user_id = ?
      ORDER BY payments.paid_at DESC, payments.updated_at DESC
    `,
    [userId],
  );

  return (result[0]?.values ?? []).map(toPayment);
}

export function listNegotiations(db: Database, userId: string): Negotiation[] {
  const result = db.exec(
    `
      SELECT
        negotiations.id, negotiations.user_id, negotiations.debt_id, debts.creditor_name,
        negotiations.contact_date, negotiations.contact_method, negotiations.representative, negotiations.phone_or_portal,
        negotiations.balance_cents, negotiations.current_offer_cents, negotiations.user_offer_cents, negotiations.counter_offer_cents,
        negotiations.final_agreement_cents, negotiations.number_of_payments, negotiations.due_date,
        negotiations.written_agreement_received, negotiations.pay_for_delete_included,
        negotiations.offer_expires_at, negotiations.follow_up_at, negotiations.status, negotiations.notes,
        negotiations.created_at, negotiations.updated_at
      FROM negotiations
      LEFT JOIN debts ON debts.id = negotiations.debt_id AND debts.user_id = negotiations.user_id
      WHERE negotiations.user_id = ?
      ORDER BY negotiations.contact_date DESC, negotiations.updated_at DESC
    `,
    [userId],
  );

  return (result[0]?.values ?? []).map(toNegotiation);
}

export function getPayoffSettings(db: Database, userId: string): PayoffSettings {
  const result = db.exec(
    `
      SELECT user_id, monthly_budget_cents, strategy, updated_at
        , emergency_reserve_cents, max_accounts_per_round, budget_frequency, manual_allocations_json
      FROM payoff_settings
      WHERE user_id = ?
    `,
    [userId],
  );
  const row = result[0]?.values[0];
  return row
    ? toPayoffSettings(row)
    : {
        userId,
        monthlyBudgetCents: 0,
        budgetFrequency: "MONTHLY",
        emergencyReserveCents: 0,
        maxAccountsPerRound: null,
        manualAllocations: {},
        strategy: "HYBRID",
        updatedAt: new Date().toISOString(),
      };
}

export function listPayoffMilestones(db: Database, userId: string): PayoffMilestone[] {
  const result = db.exec(
    `
      SELECT id, user_id, budget_frequency, period_start, period_end, target_cents, paid_cents, status, completed_at, created_at, updated_at
      FROM payoff_milestones
      WHERE user_id = ?
      ORDER BY period_start DESC, updated_at DESC
    `,
    [userId],
  );

  return (result[0]?.values ?? []).map(toPayoffMilestone);
}

export function exportUserBackup(db: Database, userId: string): GoXPlanBackup {
  const tables = {} as Record<BackupTableName, BackupTable>;

  for (const tableName of backupTableNames) {
    const columns = [...backupTables[tableName]];
    const result = db.exec(`SELECT ${columns.join(", ")} FROM ${tableName} WHERE user_id = ? ORDER BY updated_at DESC`, [userId]);
    tables[tableName] = {
      columns,
      rows: result[0]?.values ?? [],
    };
  }

  return {
    app: "GoXPlan",
    exportedAt: new Date().toISOString(),
    tables,
    version: 1,
  };
}

export function getBackupPreview(input: unknown): BackupPreview {
  const backup = normalizeBackupPayload(input);
  return {
    counts: getBackupCounts(backup),
    details: getBackupDetails(backup),
    exportedAt: backup.exportedAt,
    version: backup.version,
  };
}

export async function importUserBackup(db: Database, userId: string, input: unknown, mode: BackupImportMode): Promise<BackupImportSummary> {
  const backup = normalizeBackupPayload(input);
  const counts = getBackupCounts(backup);

  db.run("BEGIN TRANSACTION");
  try {
    if (mode === "REPLACE") {
      for (const tableName of backupDeleteOrder) {
        db.run(`DELETE FROM ${tableName} WHERE user_id = ?`, [userId]);
      }
    }

    for (const tableName of backupImportOrder) {
      for (const row of backup.tables[tableName].rows) {
        upsertBackupRow(db, userId, tableName, backup.tables[tableName].columns, row);
      }
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
  return {
    counts,
    importedAt: new Date().toISOString(),
    mode,
  };
}

export async function upsertDebt(db: Database, userId: string, input: DebtInput) {
  const now = new Date().toISOString();
  const debtId = input.id ?? crypto.randomUUID();
  const existing = input.id ? findDebtById(db, userId, input.id) : undefined;
  const balanceCents = parseMoneyToCents(input.balance);
  const settlementCents = input.settlement.trim() ? parseMoneyToCents(input.settlement) : null;
  const pastDueCents = input.pastDue.trim() ? parseMoneyToCents(input.pastDue) : null;
  const aprBasisPoints = input.apr.trim() ? parseAprToBasisPoints(input.apr) : null;
  const minimumPaymentCents = input.minimumPayment.trim() ? parseMoneyToCents(input.minimumPayment) : null;
  const monthsBehind = input.monthsBehind.trim() ? parseNonNegativeInteger(input.monthsBehind, "Months behind") : null;
  const targetDate = input.targetDate.trim() ? parseDateToIso(input.targetDate, now) : null;
  const settlementExpiresAt = input.settlementExpiresDate.trim() ? parseDateToIso(input.settlementExpiresDate, now) : null;
  const priorityScore = normalizePriorityScore(input.priorityScore);
  const trackedAt = parseDateToIso(input.trackedDate, now);

  if (!input.creditorName.trim()) throw new Error("Creditor name is required.");
  if (!Number.isInteger(input.priority) || input.priority < 1) throw new Error("Priority must be 1 or higher.");
  if (balanceCents < 0) throw new Error("Balance cannot be negative.");
  if (settlementCents !== null && settlementCents < 0) throw new Error("Settlement cannot be negative.");
  if (pastDueCents !== null && pastDueCents > balanceCents) throw new Error("Past due amount cannot be greater than the full balance.");

  db.run("BEGIN TRANSACTION");
  try {
    db.run(
      `
        INSERT INTO debts (
          id, user_id, priority, priority_score, tracked_at, creditor_name, category, balance_cents, settlement_cents,
          past_due_cents, apr_basis_points, minimum_payment_cents, months_behind, target_date, settlement_expires_at, status,
          reported, pay_for_delete, negotiable, reason, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          priority = excluded.priority,
          priority_score = excluded.priority_score,
          tracked_at = excluded.tracked_at,
          creditor_name = excluded.creditor_name,
          category = excluded.category,
          balance_cents = excluded.balance_cents,
          settlement_cents = excluded.settlement_cents,
          past_due_cents = excluded.past_due_cents,
          apr_basis_points = excluded.apr_basis_points,
          minimum_payment_cents = excluded.minimum_payment_cents,
          months_behind = excluded.months_behind,
          target_date = excluded.target_date,
          settlement_expires_at = excluded.settlement_expires_at,
          status = excluded.status,
          reported = excluded.reported,
          pay_for_delete = excluded.pay_for_delete,
          negotiable = excluded.negotiable,
          reason = excluded.reason,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `,
      [
        debtId,
        userId,
        input.priority,
        priorityScore,
        trackedAt,
        input.creditorName.trim(),
        input.category,
        balanceCents,
        settlementCents,
        pastDueCents,
        aprBasisPoints,
        minimumPaymentCents,
        monthsBehind,
        targetDate,
        settlementExpiresAt,
        input.status,
        input.reported ? 1 : 0,
        input.payForDelete ? 1 : 0,
        input.negotiable ? 1 : 0,
        input.reason.trim(),
        input.notes.trim(),
        existing?.createdAt ?? now,
        now,
      ],
    );

    const savedDebt = findDebtById(db, userId, debtId);
    if (savedDebt) {
      insertDebtSnapshot(db, userId, {
        debt: savedDebt,
        notes: existing ? "Debt details updated." : "Debt added.",
        reason: existing ? "DEBT_UPDATED" : "DEBT_CREATED",
        snapshotAt: now,
        sourceId: debtId,
      });
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
  return findDebtById(db, userId, debtId)!;
}

export async function deleteDebt(db: Database, userId: string, debtId: string) {
  const existing = findDebtById(db, userId, debtId);

  db.run("BEGIN TRANSACTION");
  try {
    if (existing) {
      insertDebtSnapshot(db, userId, {
        debt: existing,
        notes: "Debt deleted.",
        reason: "DEBT_DELETED",
        snapshotAt: new Date().toISOString(),
        sourceId: debtId,
      });
    }
    db.run("DELETE FROM debts WHERE id = ? AND user_id = ?", [debtId, userId]);
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
}

export async function upsertFinancialAccount(db: Database, userId: string, input: FinancialAccountInput) {
  const now = new Date().toISOString();
  const accountId = input.id ?? crypto.randomUUID();
  const existing = input.id ? findFinancialAccountById(db, userId, input.id) : undefined;
  const maxSubAccounts = input.maxSubAccounts.trim() ? parseBoundedInteger(input.maxSubAccounts, "Max accounts", 1, 5) : null;
  const availableBalanceCents = parseMoneyToCents(input.availableBalance);
  const tradingAccountProfitsCents = getTradingAccountProfits(input, maxSubAccounts ?? 1, availableBalanceCents);
  const payoutLimitBasisPoints = input.payoutLimitPercent.trim() ? parsePercentToBasisPoints(input.payoutLimitPercent, "Payout limit") : null;
  const feeBasisPoints = input.feePercent.trim() ? parsePercentToBasisPoints(input.feePercent, "Fee") : null;

  if (!input.name.trim()) throw new Error("Account name is required.");
  if (existing && input.accountType === "TRADING" && existing.accountType !== "TRADING" && hasCashAccountLinks(db, userId, accountId)) {
    throw new Error("Accounts used for cash deposits, payments, or transfers must stay bank/cash accounts.");
  }

  db.run(
    `
      INSERT INTO financial_accounts (
        id, user_id, name, account_type, institution, available_balance_cents, max_sub_accounts, copied_accounts,
        trading_account_profits_cents, payout_limit_basis_points, fee_basis_points, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        account_type = excluded.account_type,
        institution = excluded.institution,
        available_balance_cents = excluded.available_balance_cents,
        max_sub_accounts = excluded.max_sub_accounts,
        copied_accounts = excluded.copied_accounts,
        trading_account_profits_cents = excluded.trading_account_profits_cents,
        payout_limit_basis_points = excluded.payout_limit_basis_points,
        fee_basis_points = excluded.fee_basis_points,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `,
    [
      accountId,
      userId,
      input.name.trim(),
      input.accountType,
      input.institution.trim(),
      availableBalanceCents,
      maxSubAccounts,
      input.copiedAccounts ? 1 : 0,
      JSON.stringify(tradingAccountProfitsCents),
      payoutLimitBasisPoints,
      feeBasisPoints,
      input.notes.trim(),
      existing?.createdAt ?? now,
      now,
    ],
  );

  await saveDatabase(db);
  return findFinancialAccountById(db, userId, accountId)!;
}

export async function deleteFinancialAccount(db: Database, userId: string, accountId: string) {
  db.run("UPDATE income SET account_id = NULL WHERE user_id = ? AND account_id = ?", [userId, accountId]);
  db.run("UPDATE income SET destination_account_id = NULL WHERE user_id = ? AND destination_account_id = ?", [userId, accountId]);
  db.run("UPDATE payments SET account_id = NULL WHERE user_id = ? AND account_id = ?", [userId, accountId]);
  db.run("UPDATE account_movements SET from_account_id = NULL WHERE user_id = ? AND from_account_id = ?", [userId, accountId]);
  db.run("UPDATE account_movements SET to_account_id = NULL WHERE user_id = ? AND to_account_id = ?", [userId, accountId]);
  db.run("DELETE FROM financial_accounts WHERE id = ? AND user_id = ?", [accountId, userId]);
  await saveDatabase(db);
}

export async function upsertAccountMovement(db: Database, userId: string, input: AccountMovementInput) {
  const now = new Date().toISOString();
  const movementId = input.id ?? crypto.randomUUID();
  const existing = input.id ? findAccountMovementById(db, userId, input.id) : undefined;
  const amountCents = parseMoneyToCents(input.amount);
  const occurredAt = parseDateToIso(input.occurredDate, now);
  const movementType = normalizeAccountMovementType(input.movementType);
  let fromAccountId: string | null = null;
  let toAccountId: string | null = null;

  if (amountCents <= 0) throw new Error("Amount must be greater than zero.");

  if (movementType === "TRANSFER") {
    fromAccountId = input.fromAccountId.trim();
    toAccountId = input.toAccountId.trim();
    if (!fromAccountId || !toAccountId) throw new Error("Choose both transfer accounts.");
    if (fromAccountId === toAccountId) throw new Error("Transfer accounts must be different.");
  } else {
    const adjustmentAccountId = input.adjustmentAccountId.trim();
    if (!adjustmentAccountId) throw new Error("Choose the account to adjust.");
    if (input.adjustmentDirection === "DECREASE") {
      fromAccountId = adjustmentAccountId;
    } else {
      toAccountId = adjustmentAccountId;
    }
  }

  validateCashMovementAccount(db, userId, fromAccountId, "Source account");
  validateCashMovementAccount(db, userId, toAccountId, "Destination account");

  db.run("BEGIN TRANSACTION");
  try {
    if (existing) restoreAccountMovement(db, userId, existing);
    applyAccountMovement(db, userId, fromAccountId, toAccountId, amountCents);

    db.run(
      `
        INSERT INTO account_movements (
          id, user_id, movement_type, from_account_id, to_account_id, amount_cents, occurred_at, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          movement_type = excluded.movement_type,
          from_account_id = excluded.from_account_id,
          to_account_id = excluded.to_account_id,
          amount_cents = excluded.amount_cents,
          occurred_at = excluded.occurred_at,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `,
      [movementId, userId, movementType, fromAccountId, toAccountId, amountCents, occurredAt, input.notes.trim(), existing?.createdAt ?? now, now],
    );

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
  return findAccountMovementById(db, userId, movementId)!;
}

export async function deleteAccountMovement(db: Database, userId: string, movementId: string) {
  const existing = findAccountMovementById(db, userId, movementId);
  if (!existing) return;

  db.run("BEGIN TRANSACTION");
  try {
    restoreAccountMovement(db, userId, existing);
    db.run("DELETE FROM account_movements WHERE id = ? AND user_id = ?", [movementId, userId]);
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
}

export async function upsertIncome(db: Database, userId: string, input: IncomeInput) {
  const now = new Date().toISOString();
  const incomeId = input.id ?? crypto.randomUUID();
  const existing = input.id ? findIncomeById(db, userId, input.id) : undefined;
  const amountPerAccountCents = parseMoneyToCents(input.grossAmount);
  const accountId = input.accountId.trim() || null;
  const destinationAccountId = input.destinationAccountId.trim() || null;
  const account = accountId ? findFinancialAccountById(db, userId, accountId) : undefined;
  const destinationAccount = destinationAccountId ? findFinancialAccountById(db, userId, destinationAccountId) : undefined;
  const validationAccount = account && existing?.accountId === account.id ? restoreFinancialAccountFromIncome(account, existing) : account;
  const isTradingAccount = input.sourceType === "TOPSTEP" || validationAccount?.accountType === "TRADING";
  const grossAmountCents = isTradingAccount ? getTradingGrossAmount(input, amountPerAccountCents) : amountPerAccountCents;
  const topstepDetails = getTopstepDetails(input, validationAccount, amountPerAccountCents);
  const feesCents = isTradingAccount ? topstepDetails.feeCents ?? 0 : input.fees.trim() ? parseMoneyToCents(input.fees) : 0;
  const taxWithholdingCents = input.taxWithholding.trim() ? parseMoneyToCents(input.taxWithholding) : 0;
  const allocatedAmountCents = input.allocatedAmount.trim() ? parseMoneyToCents(input.allocatedAmount) : 0;
  const netAmountCents = grossAmountCents - feesCents - taxWithholdingCents;
  const receivedAt = parseDateToIso(input.receivedDate, now);

  if (!input.source.trim()) throw new Error("Income source is required.");
  if (accountId && !account) throw new Error("Selected account could not be found.");
  if (destinationAccountId && !destinationAccount) throw new Error("Destination account could not be found.");
  if (destinationAccount?.accountType === "TRADING") throw new Error("Choose a bank or cash account as the deposit destination.");
  if (amountPerAccountCents <= 0) throw new Error("Gross income amount must be greater than zero.");
  if (isTradingAccount && topstepDetails.withdrawableCents !== null && grossAmountCents > topstepDetails.withdrawableCents) {
    throw new Error(`Trading payout cannot be more than ${formatCentsForError(topstepDetails.withdrawableCents)} for the selected account scope.`);
  }
  if (netAmountCents < 0) throw new Error("Fees and tax withholding cannot exceed gross income.");

  db.run("BEGIN TRANSACTION");
  try {
    db.run(
      `
        INSERT INTO income (
          id, user_id, account_id, destination_account_id, source, source_type, amount_cents, gross_amount_cents, fees_cents, tax_withholding_cents,
          net_amount_cents, allocated_amount_cents, topstep_account_count, topstep_copied_accounts, topstep_payout_scope,
          topstep_selected_account, topstep_profit_per_account_cents, topstep_total_profit_cents, topstep_withdrawable_cents,
          topstep_fee_cents, received_at, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          account_id = excluded.account_id,
          destination_account_id = excluded.destination_account_id,
          source = excluded.source,
          source_type = excluded.source_type,
          amount_cents = excluded.amount_cents,
          gross_amount_cents = excluded.gross_amount_cents,
          fees_cents = excluded.fees_cents,
          tax_withholding_cents = excluded.tax_withholding_cents,
          net_amount_cents = excluded.net_amount_cents,
          allocated_amount_cents = excluded.allocated_amount_cents,
          topstep_account_count = excluded.topstep_account_count,
          topstep_copied_accounts = excluded.topstep_copied_accounts,
          topstep_payout_scope = excluded.topstep_payout_scope,
          topstep_selected_account = excluded.topstep_selected_account,
          topstep_profit_per_account_cents = excluded.topstep_profit_per_account_cents,
          topstep_total_profit_cents = excluded.topstep_total_profit_cents,
          topstep_withdrawable_cents = excluded.topstep_withdrawable_cents,
          topstep_fee_cents = excluded.topstep_fee_cents,
          received_at = excluded.received_at,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `,
      [
        incomeId,
        userId,
        accountId,
        destinationAccountId,
        input.source.trim(),
        input.sourceType,
        netAmountCents,
        grossAmountCents,
        feesCents,
        taxWithholdingCents,
        netAmountCents,
        allocatedAmountCents,
        topstepDetails.accountCount,
        topstepDetails.copiedAccounts ? 1 : 0,
        topstepDetails.payoutScope,
        topstepDetails.selectedAccount,
        topstepDetails.profitPerAccountCents,
        topstepDetails.totalProfitCents,
        topstepDetails.withdrawableCents,
        topstepDetails.feeCents,
        receivedAt,
        input.notes.trim(),
        existing?.createdAt ?? now,
        now,
      ],
    );

    applyIncomeAccountBalanceChange(db, userId, existing, input, accountId, destinationAccountId, netAmountCents);
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
  return findIncomeById(db, userId, incomeId)!;
}

export async function deleteIncome(db: Database, userId: string, incomeId: string) {
  const existing = findIncomeById(db, userId, incomeId);
  if (!existing) return;

  db.run("BEGIN TRANSACTION");
  try {
    restoreIncomeAccountMovements(db, userId, existing);
    db.run("DELETE FROM income WHERE id = ? AND user_id = ?", [incomeId, userId]);
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
}

export async function upsertPayment(db: Database, userId: string, input: PaymentInput) {
  const now = new Date().toISOString();
  const paymentId = input.id ?? crypto.randomUUID();
  const existing = input.id ? findPaymentById(db, userId, input.id) : undefined;
  const accountId = input.accountId.trim() || null;
  const account = accountId ? findFinancialAccountById(db, userId, accountId) : undefined;
  const amountCents = parseMoneyToCents(input.amount);
  const interestAndFeesCents = input.interestAndFees.trim() ? parseMoneyToCents(input.interestAndFees) : null;
  const principalCents = input.principal.trim() ? parseMoneyToCents(input.principal) : Math.max(0, amountCents - (interestAndFeesCents ?? 0));
  const resultingBalanceCents = input.resultingBalance.trim()
    ? parseMoneyToCents(input.resultingBalance)
    : input.updateDebtStatus && (input.paymentType === "SETTLEMENT" || input.paymentType === "PAYOFF")
      ? 0
      : null;
  const paidAt = parseDateToIso(input.paidDate, now);
  const debt = findDebtById(db, userId, input.debtId);

  if (!input.debtId) throw new Error("Choose a debt for this payment.");
  if (!debt) throw new Error("That debt could not be found.");
  if (accountId && !account) throw new Error("Selected payment account could not be found.");
  if (account?.accountType === "TRADING") throw new Error("Choose a bank or cash account for debt payments.");
  if (amountCents <= 0) throw new Error("Payment amount must be greater than zero.");
  if (principalCents !== null && interestAndFeesCents !== null && principalCents + interestAndFeesCents > amountCents) {
    throw new Error("Principal plus interest and fees cannot exceed the payment amount.");
  }

  db.run("BEGIN TRANSACTION");
  try {
    if (input.id) restoreDebtSnapshotFromPayment(db, userId, input.id);
    if (existing) restorePaymentAccountMovement(db, userId, existing);
    const restoredDebt = findDebtById(db, userId, input.debtId);
    const debtStatusBefore = input.updateDebtStatus && (input.paymentType === "SETTLEMENT" || input.paymentType === "PAYOFF") ? restoredDebt?.status ?? null : null;
    const debtStatusAfter = debtStatusBefore ? "SETTLED" : null;
    const debtBalanceBefore = resultingBalanceCents !== null ? restoredDebt?.balanceCents ?? null : null;
    const debtBalanceAfter = resultingBalanceCents;

    db.run(
      `
        INSERT INTO payments (
          id, user_id, debt_id, account_id, payment_type, amount_cents, principal_cents, interest_and_fees_cents,
          resulting_balance_cents, confirmation_number, payment_method, debt_status_before, debt_status_after,
          debt_balance_before_cents, debt_balance_after_cents, paid_at, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          debt_id = excluded.debt_id,
          account_id = excluded.account_id,
          payment_type = excluded.payment_type,
          amount_cents = excluded.amount_cents,
          principal_cents = excluded.principal_cents,
          interest_and_fees_cents = excluded.interest_and_fees_cents,
          resulting_balance_cents = excluded.resulting_balance_cents,
          confirmation_number = excluded.confirmation_number,
          payment_method = excluded.payment_method,
          debt_status_before = excluded.debt_status_before,
          debt_status_after = excluded.debt_status_after,
          debt_balance_before_cents = excluded.debt_balance_before_cents,
          debt_balance_after_cents = excluded.debt_balance_after_cents,
          paid_at = excluded.paid_at,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `,
      [
        paymentId,
        userId,
        input.debtId,
        accountId,
        input.paymentType,
        amountCents,
        principalCents,
        interestAndFeesCents,
        resultingBalanceCents,
        input.confirmationNumber.trim(),
        input.paymentMethod.trim(),
        debtStatusBefore,
        debtStatusAfter,
        debtBalanceBefore,
        debtBalanceAfter,
        paidAt,
        input.notes.trim(),
        existing?.createdAt ?? now,
        now,
      ],
    );

    if (accountId) adjustFinancialAccountBalance(db, userId, accountId, -amountCents);

    if (input.updateDebtStatus && (input.paymentType === "SETTLEMENT" || input.paymentType === "PAYOFF")) {
      db.run("UPDATE debts SET status = 'SETTLED', updated_at = ? WHERE id = ? AND user_id = ?", [now, input.debtId, userId]);
    }
    if (resultingBalanceCents !== null) {
      db.run("UPDATE debts SET balance_cents = ?, updated_at = ? WHERE id = ? AND user_id = ?", [resultingBalanceCents, now, input.debtId, userId]);
    }

    if (resultingBalanceCents !== null || existing?.resultingBalanceCents !== null) {
      const updatedDebt = findDebtById(db, userId, input.debtId);
      if (updatedDebt) {
        insertDebtSnapshot(db, userId, {
          debt: updatedDebt,
          notes: existing ? "Payment edited; balance snapshot corrected." : "Payment recorded.",
          reason: existing ? "PAYMENT_EDITED" : "PAYMENT_RECORDED",
          snapshotAt: paidAt,
          sourceId: paymentId,
        });
      }
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
  return findPaymentById(db, userId, paymentId)!;
}

export async function deletePayment(db: Database, userId: string, paymentId: string) {
  const existing = findPaymentById(db, userId, paymentId);
  if (!existing) return;

  db.run("BEGIN TRANSACTION");
  try {
    restorePaymentAccountMovement(db, userId, existing);
    restoreDebtSnapshotFromPayment(db, userId, paymentId);
    const restoredDebt = existing.debtId ? findDebtById(db, userId, existing.debtId) : undefined;
    if (restoredDebt && existing.resultingBalanceCents !== null) {
      insertDebtSnapshot(db, userId, {
        debt: restoredDebt,
        notes: "Payment deleted; balance restored.",
        reason: "PAYMENT_DELETED",
        snapshotAt: new Date().toISOString(),
        sourceId: paymentId,
      });
    }
    db.run("DELETE FROM payments WHERE id = ? AND user_id = ?", [paymentId, userId]);
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  await saveDatabase(db);
}

export async function upsertNegotiation(db: Database, userId: string, input: NegotiationInput) {
  const now = new Date().toISOString();
  const negotiationId = input.id ?? crypto.randomUUID();
  const existing = input.id ? findNegotiationById(db, userId, input.id) : undefined;
  const debtId = input.debtId.trim() || null;
  const contactDate = parseDateToIso(input.contactDate, now);
  const dueDate = input.dueDate.trim() ? parseDateToIso(input.dueDate, now) : null;
  const offerExpiresAt = input.offerExpiresDate.trim() ? parseDateToIso(input.offerExpiresDate, now) : null;
  const followUpAt = input.followUpDate.trim() ? parseDateToIso(input.followUpDate, now) : null;
  const numberOfPayments = input.numberOfPayments.trim() ? parseBoundedInteger(input.numberOfPayments, "Number of payments", 1, 120) : null;

  if (!debtId) throw new Error("Choose a debt for this negotiation.");
  if (!findDebtById(db, userId, debtId)) throw new Error("Selected debt could not be found.");

  db.run(
    `
      INSERT INTO negotiations (
        id, user_id, debt_id, contact_date, contact_method, representative, phone_or_portal,
        balance_cents, current_offer_cents, user_offer_cents, counter_offer_cents, final_agreement_cents,
        number_of_payments, due_date, written_agreement_received, pay_for_delete_included,
        offer_expires_at, follow_up_at, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        debt_id = excluded.debt_id,
        contact_date = excluded.contact_date,
        contact_method = excluded.contact_method,
        representative = excluded.representative,
        phone_or_portal = excluded.phone_or_portal,
        balance_cents = excluded.balance_cents,
        current_offer_cents = excluded.current_offer_cents,
        user_offer_cents = excluded.user_offer_cents,
        counter_offer_cents = excluded.counter_offer_cents,
        final_agreement_cents = excluded.final_agreement_cents,
        number_of_payments = excluded.number_of_payments,
        due_date = excluded.due_date,
        written_agreement_received = excluded.written_agreement_received,
        pay_for_delete_included = excluded.pay_for_delete_included,
        offer_expires_at = excluded.offer_expires_at,
        follow_up_at = excluded.follow_up_at,
        status = excluded.status,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `,
    [
      negotiationId,
      userId,
      debtId,
      contactDate,
      input.contactMethod,
      input.representative.trim(),
      input.phoneOrPortal.trim(),
      nullableMoneyToCents(input.balance),
      nullableMoneyToCents(input.currentOffer),
      nullableMoneyToCents(input.userOffer),
      nullableMoneyToCents(input.counterOffer),
      nullableMoneyToCents(input.finalAgreement),
      numberOfPayments,
      dueDate,
      input.writtenAgreementReceived ? 1 : 0,
      input.payForDeleteIncluded ? 1 : 0,
      offerExpiresAt,
      followUpAt,
      input.status,
      input.notes.trim(),
      existing?.createdAt ?? now,
      now,
    ],
  );

  await saveDatabase(db);
  return findNegotiationById(db, userId, negotiationId)!;
}

export async function deleteNegotiation(db: Database, userId: string, negotiationId: string) {
  db.run("DELETE FROM negotiations WHERE id = ? AND user_id = ?", [negotiationId, userId]);
  await saveDatabase(db);
}

export async function upsertPayoffSettings(db: Database, userId: string, input: PayoffSettingsInput) {
  const now = new Date().toISOString();
  const monthlyBudgetCents = parseMoneyToCents(input.monthlyBudget);
  const emergencyReserveCents = parseMoneyToCents(input.emergencyReserve);
  const maxAccountsPerRound = input.maxAccountsPerRound.trim()
    ? parseBoundedInteger(input.maxAccountsPerRound, "Maximum accounts", 1, 50)
    : null;
  const budgetFrequency = normalizePayoffBudgetFrequency(input.budgetFrequency);
  const manualAllocations = parseManualAllocationInput(input.manualAllocations);
  const strategy = normalizePayoffStrategy(input.strategy);

  if (monthlyBudgetCents < 0) throw new Error("Payoff budget cannot be negative.");
  if (emergencyReserveCents < 0) throw new Error("Emergency reserve cannot be negative.");

  db.run(
    `
      INSERT INTO payoff_settings (
        user_id, monthly_budget_cents, budget_frequency, emergency_reserve_cents, max_accounts_per_round, manual_allocations_json, strategy, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        monthly_budget_cents = excluded.monthly_budget_cents,
        budget_frequency = excluded.budget_frequency,
        emergency_reserve_cents = excluded.emergency_reserve_cents,
        max_accounts_per_round = excluded.max_accounts_per_round,
        manual_allocations_json = excluded.manual_allocations_json,
        strategy = excluded.strategy,
        updated_at = excluded.updated_at
    `,
    [userId, monthlyBudgetCents, budgetFrequency, emergencyReserveCents, maxAccountsPerRound, JSON.stringify(manualAllocations), strategy, now],
  );

  await saveDatabase(db);
  return getPayoffSettings(db, userId);
}

export async function upsertPayoffMilestone(db: Database, userId: string, input: PayoffMilestoneInput) {
  const now = new Date().toISOString();
  const targetCents = Math.max(0, Math.round(input.targetCents));
  const paidCents = Math.max(0, Math.round(input.paidCents));
  const status: PayoffMilestoneStatus = targetCents > 0 && paidCents >= targetCents ? "DONE" : "ACTIVE";
  const completedAt = status === "DONE" ? now : null;
  const budgetFrequency = normalizePayoffBudgetFrequency(input.budgetFrequency);
  const periodStart = normalizeDateKey(input.periodStart, "Period start");
  const periodEnd = normalizeDateKey(input.periodEnd, "Period end");

  if (periodEnd < periodStart) throw new Error("Period end must be after period start.");

  db.run(
    `
      INSERT INTO payoff_milestones (
        id, user_id, budget_frequency, period_start, period_end, target_cents, paid_cents, status, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, budget_frequency, period_start, period_end) DO UPDATE SET
        target_cents = excluded.target_cents,
        paid_cents = excluded.paid_cents,
        status = excluded.status,
        completed_at = CASE
          WHEN excluded.status = 'DONE' THEN COALESCE(payoff_milestones.completed_at, excluded.completed_at)
          ELSE NULL
        END,
        updated_at = excluded.updated_at
    `,
    [crypto.randomUUID(), userId, budgetFrequency, periodStart, periodEnd, targetCents, paidCents, status, completedAt, now, now],
  );

  await saveDatabase(db);
  return findPayoffMilestone(db, userId, budgetFrequency, periodStart, periodEnd)!;
}

function normalizeBackupPayload(input: unknown): GoXPlanBackup {
  if (!isRecord(input) || input.app !== "GoXPlan" || input.version !== 1 || !isRecord(input.tables)) {
    throw new Error("This backup file does not look like a GoXPlan backup.");
  }

  const tables = {} as Record<BackupTableName, BackupTable>;

  for (const tableName of backupTableNames) {
    const table = input.tables[tableName];
    const expectedColumns = [...backupTables[tableName]];

    if (table === undefined) {
      tables[tableName] = { columns: expectedColumns, rows: [] };
      continue;
    }

    if (!isRecord(table) || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
      throw new Error(`The ${tableName} backup section is not valid.`);
    }

    let columns = table.columns.map((column) => String(column));
    let rows = table.rows;
    if (tableName === "income" || tableName === "payments") {
      const upgraded = upgradeBackupRowsWithOptionalColumns(tableName, columns, rows, expectedColumns);
      columns = upgraded.columns;
      rows = upgraded.rows;
    }

    if (columns.join("|") !== expectedColumns.join("|")) {
      throw new Error(`The ${tableName} backup section uses columns this app version cannot restore.`);
    }

    const normalizedRows = rows.map((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== columns.length) {
        throw new Error(`The ${tableName} backup section has a row with the wrong shape.`);
      }
      row.forEach((value, valueIndex) => assertBackupCellValue(tableName, columns[valueIndex], rowIndex, value));
      return row;
    });

    tables[tableName] = { columns, rows: normalizedRows };
  }

  return {
    app: "GoXPlan",
    exportedAt: typeof input.exportedAt === "string" ? input.exportedAt : new Date().toISOString(),
    tables,
    version: 1,
  };
}

function assertBackupCellValue(tableName: BackupTableName, columnName: string, rowIndex: number, value: unknown) {
  if (value === null) return;
  if (typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;

  throw new Error(`The ${tableName} backup section has an unsupported value in ${columnName} on row ${rowIndex + 1}.`);
}

function upgradeBackupRowsWithOptionalColumns(tableName: BackupTableName, columns: string[], rows: unknown[], expectedColumns: string[]) {
  let nextColumns = columns;
  let nextRows = rows;

  const optionalColumns =
    tableName === "income"
      ? ["destination_account_id"]
      : ["account_id", "debt_status_before", "debt_status_after", "debt_balance_before_cents", "debt_balance_after_cents"];

  for (const missingColumn of optionalColumns) {
    if (nextColumns.includes(missingColumn)) continue;
    const insertAt = expectedColumns.indexOf(missingColumn);
    nextColumns = [...nextColumns.slice(0, insertAt), missingColumn, ...nextColumns.slice(insertAt)];
    nextRows = nextRows.map((row) => (Array.isArray(row) ? [...row.slice(0, insertAt), null, ...row.slice(insertAt)] : row));
  }

  return { columns: nextColumns, rows: nextRows };
}

function getBackupCounts(backup: GoXPlanBackup): BackupRecordCounts {
  return {
    accounts: backup.tables.financial_accounts.rows.length,
    accountMovements: backup.tables.account_movements.rows.length,
    debts: backup.tables.debts.rows.length,
    debtSnapshots: backup.tables.debt_snapshots.rows.length,
    income: backup.tables.income.rows.length,
    negotiations: backup.tables.negotiations.rows.length,
    payments: backup.tables.payments.rows.length,
    payoffMilestones: backup.tables.payoff_milestones.rows.length,
    payoffSettings: backup.tables.payoff_settings.rows.length,
  };
}

function getBackupDetails(backup: GoXPlanBackup): BackupPreview["details"] {
  const accountTypeIndex = backup.tables.financial_accounts.columns.indexOf("account_type");
  const sourceTypeIndex = backup.tables.income.columns.indexOf("source_type");
  const paymentBalanceBeforeIndex = backup.tables.payments.columns.indexOf("debt_balance_before_cents");
  const paymentBalanceAfterIndex = backup.tables.payments.columns.indexOf("debt_balance_after_cents");
  const budgetFrequencyIndex = backup.tables.payoff_settings.columns.indexOf("budget_frequency");
  const payoffFrequencies = new Set<PayoffBudgetFrequency>();

  for (const row of backup.tables.payoff_settings.rows) {
    const frequency = normalizePayoffBudgetFrequency(String(row[budgetFrequencyIndex] ?? "MONTHLY"));
    payoffFrequencies.add(frequency);
  }

  return {
    paymentSnapshots:
      paymentBalanceBeforeIndex < 0 || paymentBalanceAfterIndex < 0
        ? 0
        : backup.tables.payments.rows.filter((row) => row[paymentBalanceBeforeIndex] !== null || row[paymentBalanceAfterIndex] !== null).length,
    payoffFrequencies: [...payoffFrequencies],
    tradingAccounts: accountTypeIndex < 0 ? 0 : backup.tables.financial_accounts.rows.filter((row) => row[accountTypeIndex] === "TRADING").length,
    tradingIncome: sourceTypeIndex < 0 ? 0 : backup.tables.income.rows.filter((row) => row[sourceTypeIndex] === "TOPSTEP").length,
  };
}

function upsertBackupRow(db: Database, userId: string, tableName: BackupTableName, columns: string[], row: unknown[]) {
  const conflictColumns =
    tableName === "payoff_settings"
      ? ["user_id"]
      : tableName === "payoff_milestones"
        ? ["user_id", "budget_frequency", "period_start", "period_end"]
        : ["id"];
  const values = sanitizeBackupRow(db, userId, tableName, columns, row);
  const placeholders = columns.map(() => "?").join(", ");
  const updateColumns = columns.filter((column) => !conflictColumns.includes(column) && !(tableName === "payoff_milestones" && column === "id"));
  const updateClause = updateColumns.map((column) => `${column} = excluded.${column}`).join(", ");

  db.run(
    `
      INSERT INTO ${tableName} (${columns.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT(${conflictColumns.join(", ")}) DO UPDATE SET ${updateClause}
    `,
    values,
  );
}

function sanitizeBackupRow(db: Database, userId: string, tableName: BackupTableName, columns: string[], row: unknown[]): SqlValue[] {
  const values = columns.map((column, index) => toSqlValue(column === "user_id" ? userId : row[index]));

  if (tableName === "debts") {
    sanitizeStringEnumValue(values, columns, "category", normalizeDebtCategory, "OTHER");
    sanitizeDebtStatusValue(values, columns, "status", "OPEN");
  }

  if (tableName === "debt_snapshots") {
    sanitizeDebtStatusValue(values, columns, "status", "OPEN");
    sanitizeStringEnumValue(values, columns, "reason", normalizeDebtSnapshotReason, "DEBT_UPDATED");
    const debtIdIndex = columns.indexOf("debt_id");
    const debtId = debtIdIndex >= 0 ? values[debtIdIndex] : null;
    if (debtId && !findDebtById(db, userId, String(debtId))) {
      values[debtIdIndex] = null;
    }
  }

  if (tableName === "financial_accounts") {
    sanitizeStringEnumValue(values, columns, "account_type", normalizeFinancialAccountType, "OTHER");
  }

  if (tableName === "account_movements") {
    sanitizeStringEnumValue(values, columns, "movement_type", normalizeAccountMovementType, "ADJUSTMENT");
    const fromAccountIdIndex = columns.indexOf("from_account_id");
    const fromAccountId = fromAccountIdIndex >= 0 ? values[fromAccountIdIndex] : null;
    if (fromAccountId && !findFinancialAccountById(db, userId, String(fromAccountId))) {
      values[fromAccountIdIndex] = null;
    }
    const toAccountIdIndex = columns.indexOf("to_account_id");
    const toAccountId = toAccountIdIndex >= 0 ? values[toAccountIdIndex] : null;
    if (toAccountId && !findFinancialAccountById(db, userId, String(toAccountId))) {
      values[toAccountIdIndex] = null;
    }
  }

  if (tableName === "income") {
    sanitizeStringEnumValue(values, columns, "source_type", normalizeIncomeSourceType, "OTHER");
    sanitizeNullableStringEnumValue(values, columns, "topstep_payout_scope", normalizeTopstepPayoutScope);
    const accountIdIndex = columns.indexOf("account_id");
    const accountId = accountIdIndex >= 0 ? values[accountIdIndex] : null;
    if (accountId && !findFinancialAccountById(db, userId, String(accountId))) {
      values[accountIdIndex] = null;
    }
    const destinationAccountIdIndex = columns.indexOf("destination_account_id");
    const destinationAccountId = destinationAccountIdIndex >= 0 ? values[destinationAccountIdIndex] : null;
    if (destinationAccountId && !findFinancialAccountById(db, userId, String(destinationAccountId))) {
      values[destinationAccountIdIndex] = null;
    }
  }

  if (tableName === "negotiations") {
    sanitizeStringEnumValue(values, columns, "contact_method", normalizeNegotiationContactMethod, "OTHER");
    sanitizeStringEnumValue(values, columns, "status", normalizeNegotiationStatus, "CONTACTED");
  }

  if (tableName === "payments" || tableName === "negotiations") {
    const debtIdIndex = columns.indexOf("debt_id");
    const debtId = debtIdIndex >= 0 ? values[debtIdIndex] : null;
    if (debtId && !findDebtById(db, userId, String(debtId))) {
      values[debtIdIndex] = null;
    }
  }

  if (tableName === "payments") {
    sanitizeStringEnumValue(values, columns, "payment_type", normalizePaymentType, "REGULAR");
    sanitizeDebtStatusValue(values, columns, "debt_status_before", null);
    sanitizeDebtStatusValue(values, columns, "debt_status_after", null);
    const accountIdIndex = columns.indexOf("account_id");
    const accountId = accountIdIndex >= 0 ? values[accountIdIndex] : null;
    if (accountId && !findFinancialAccountById(db, userId, String(accountId))) {
      values[accountIdIndex] = null;
    }
  }

  if (tableName === "payoff_settings") {
    sanitizeStringEnumValue(values, columns, "strategy", normalizePayoffStrategy, "HYBRID");
    sanitizeStringEnumValue(values, columns, "budget_frequency", normalizePayoffBudgetFrequency, "MONTHLY");
  }

  if (tableName === "payoff_milestones") {
    sanitizeStringEnumValue(values, columns, "budget_frequency", normalizePayoffBudgetFrequency, "MONTHLY");
    sanitizeStringEnumValue(values, columns, "status", normalizePayoffMilestoneStatus, "ACTIVE");
  }

  return values;
}

function sanitizeStringEnumValue<T extends string>(
  values: SqlValue[],
  columns: string[],
  columnName: string,
  normalize: (value: string) => T,
  fallback: T,
) {
  const index = columns.indexOf(columnName);
  if (index < 0) return;

  const value = values[index];
  values[index] = typeof value === "string" ? normalize(value) : fallback;
}

function sanitizeNullableStringEnumValue<T extends string>(
  values: SqlValue[],
  columns: string[],
  columnName: string,
  normalize: (value: unknown) => T | null,
) {
  const index = columns.indexOf(columnName);
  if (index < 0) return;

  values[index] = normalize(values[index]);
}

function sanitizeDebtStatusValue(values: SqlValue[], columns: string[], columnName: string, fallback: DebtStatus | null) {
  const index = columns.indexOf(columnName);
  if (index < 0) return;

  const value = values[index];
  values[index] = isDebtStatus(value) ? value : fallback;
}

function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function firstUser(result: ReturnType<Database["exec"]>): StoredUser | undefined {
  const row = result[0]?.values[0];
  if (!row) return undefined;

  return {
    id: String(row[0]),
    firstName: String(row[1]),
    lastName: String(row[2]),
    username: String(row[3]),
    email: String(row[4]),
    passwordHash: String(row[5]),
    passwordSalt: String(row[6]),
    createdAt: String(row[7]),
    updatedAt: String(row[8]),
  };
}

function insertDebtSnapshot(
  db: Database,
  userId: string,
  input: {
    debt: Debt;
    notes: string;
    reason: DebtSnapshotReason;
    snapshotAt: string;
    sourceId: string | null;
  },
) {
  const now = new Date().toISOString();
  const snapshotAt = parseSnapshotDateTime(input.snapshotAt, now);

  db.run(
    `
      INSERT INTO debt_snapshots (
        id, user_id, debt_id, creditor_name, balance_cents, obligation_cents, status, reason,
        source_id, snapshot_at, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      crypto.randomUUID(),
      userId,
      input.debt.id,
      input.debt.creditorName,
      input.debt.balanceCents,
      getSnapshotObligationCents(input.debt),
      input.debt.status,
      input.reason,
      input.sourceId,
      snapshotAt,
      input.notes,
      now,
      now,
    ],
  );
}

function getSnapshotObligationCents(debt: Debt) {
  if (debt.status === "SETTLED") return 0;
  if (debt.pastDueCents !== null && debt.pastDueCents > 0) return debt.pastDueCents;
  if ((debt.status === "COLLECTION" || debt.status === "CLOSED" || debt.status === "NOT_REPORTED") && debt.settlementCents !== null) {
    return debt.settlementCents;
  }
  if (debt.minimumPaymentCents !== null && debt.minimumPaymentCents > 0) return debt.minimumPaymentCents;
  return Math.max(0, debt.balanceCents);
}

function findDebtById(db: Database, userId: string, debtId: string) {
  const result = db.exec(
    `
      SELECT
        id, user_id, priority, priority_score, tracked_at, creditor_name, balance_cents, settlement_cents, status,
        reported, reason, notes, created_at, updated_at, category, apr_basis_points, minimum_payment_cents,
        months_behind, target_date, settlement_expires_at, pay_for_delete, negotiable, past_due_cents
      FROM debts
      WHERE id = ? AND user_id = ?
    `,
    [debtId, userId],
  );
  const row = result[0]?.values[0];
  return row ? toDebt(row) : undefined;
}

function findIncomeById(db: Database, userId: string, incomeId: string) {
  const result = db.exec(
    `
      SELECT income.id, income.user_id, income.source, income.amount_cents, income.received_at, income.notes, income.created_at, income.updated_at
        , income.source_type, income.gross_amount_cents, income.fees_cents, income.tax_withholding_cents, income.net_amount_cents, income.allocated_amount_cents,
        income.topstep_account_count, income.topstep_copied_accounts, income.topstep_payout_scope, income.topstep_selected_account,
        income.topstep_profit_per_account_cents, income.topstep_total_profit_cents, income.topstep_withdrawable_cents, income.topstep_fee_cents,
        income.account_id, source_account.name, source_account.account_type,
        income.destination_account_id, destination_account.name, destination_account.account_type
      FROM income
      LEFT JOIN financial_accounts AS source_account ON source_account.id = income.account_id AND source_account.user_id = income.user_id
      LEFT JOIN financial_accounts AS destination_account ON destination_account.id = income.destination_account_id AND destination_account.user_id = income.user_id
      WHERE income.id = ? AND income.user_id = ?
    `,
    [incomeId, userId],
  );
  const row = result[0]?.values[0];
  return row ? toIncome(row) : undefined;
}

function findAccountMovementById(db: Database, userId: string, movementId: string) {
  const result = db.exec(
    `
      SELECT
        account_movements.id, account_movements.user_id, account_movements.movement_type,
        account_movements.from_account_id, from_account.name, from_account.account_type,
        account_movements.to_account_id, to_account.name, to_account.account_type,
        account_movements.amount_cents, account_movements.occurred_at, account_movements.notes,
        account_movements.created_at, account_movements.updated_at
      FROM account_movements
      LEFT JOIN financial_accounts AS from_account ON from_account.id = account_movements.from_account_id AND from_account.user_id = account_movements.user_id
      LEFT JOIN financial_accounts AS to_account ON to_account.id = account_movements.to_account_id AND to_account.user_id = account_movements.user_id
      WHERE account_movements.id = ? AND account_movements.user_id = ?
    `,
    [movementId, userId],
  );
  const row = result[0]?.values[0];
  return row ? toAccountMovement(row) : undefined;
}

function findFinancialAccountById(db: Database, userId: string, accountId: string) {
  const result = db.exec(
    `
      SELECT id, user_id, name, account_type, institution, available_balance_cents, max_sub_accounts, copied_accounts,
        trading_account_profits_cents, payout_limit_basis_points, fee_basis_points, notes, created_at, updated_at
      FROM financial_accounts
      WHERE id = ? AND user_id = ?
    `,
    [accountId, userId],
  );
  const row = result[0]?.values[0];
  return row ? toFinancialAccount(row) : undefined;
}

function findPaymentById(db: Database, userId: string, paymentId: string) {
  const result = db.exec(
    `
      SELECT
        payments.id, payments.user_id, payments.debt_id, debts.creditor_name, payments.amount_cents,
        payments.paid_at, payments.notes, payments.created_at, payments.updated_at,
        payments.payment_type, payments.principal_cents, payments.interest_and_fees_cents,
        payments.resulting_balance_cents, payments.confirmation_number, payments.payment_method,
        payments.account_id, financial_accounts.name, financial_accounts.account_type
      FROM payments
      LEFT JOIN debts ON debts.id = payments.debt_id AND debts.user_id = payments.user_id
      LEFT JOIN financial_accounts ON financial_accounts.id = payments.account_id AND financial_accounts.user_id = payments.user_id
      WHERE payments.id = ? AND payments.user_id = ?
    `,
    [paymentId, userId],
  );
  const row = result[0]?.values[0];
  return row ? toPayment(row) : undefined;
}

function findPayoffMilestone(
  db: Database,
  userId: string,
  budgetFrequency: PayoffBudgetFrequency,
  periodStart: string,
  periodEnd: string,
) {
  const result = db.exec(
    `
      SELECT id, user_id, budget_frequency, period_start, period_end, target_cents, paid_cents, status, completed_at, created_at, updated_at
      FROM payoff_milestones
      WHERE user_id = ? AND budget_frequency = ? AND period_start = ? AND period_end = ?
    `,
    [userId, budgetFrequency, periodStart, periodEnd],
  );
  const row = result[0]?.values[0];
  return row ? toPayoffMilestone(row) : undefined;
}

function findPaymentDebtSnapshot(db: Database, userId: string, paymentId: string) {
  const result = db.exec(
    `
      SELECT debt_id, paid_at, debt_status_before, debt_status_after, debt_balance_before_cents, debt_balance_after_cents
      FROM payments
      WHERE id = ? AND user_id = ?
    `,
    [paymentId, userId],
  );
  const row = result[0]?.values[0];
  if (!row) return undefined;

  return {
    debtId: row[0] === null || row[0] === undefined ? null : String(row[0]),
    paidAt: String(row[1]),
    statusAfter: row[3] === null || row[3] === undefined ? null : normalizeDebtStatus(String(row[3])),
    statusBefore: row[2] === null || row[2] === undefined ? null : normalizeDebtStatus(String(row[2])),
    balanceBefore: row[4] === null || row[4] === undefined ? null : Number(row[4]),
    balanceAfter: row[5] === null || row[5] === undefined ? null : Number(row[5]),
  };
}

function restoreDebtSnapshotFromPayment(db: Database, userId: string, paymentId: string) {
  const snapshot = findPaymentDebtSnapshot(db, userId, paymentId);
  if (!snapshot?.debtId) return;
  if (hasLaterDebtSnapshotChange(db, userId, snapshot.debtId, snapshot.paidAt, paymentId)) return;

  if (snapshot.statusBefore && snapshot.statusAfter) {
    db.run("UPDATE debts SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?", [
      snapshot.statusBefore,
      new Date().toISOString(),
      snapshot.debtId,
      userId,
    ]);
  }

  if (snapshot.balanceBefore !== null && snapshot.balanceAfter !== null) {
    db.run("UPDATE debts SET balance_cents = ?, updated_at = ? WHERE id = ? AND user_id = ?", [
      snapshot.balanceBefore,
      new Date().toISOString(),
      snapshot.debtId,
      userId,
    ]);
  }
}

function hasLaterDebtSnapshotChange(db: Database, userId: string, debtId: string, paidAt: string, ignoredPaymentId: string) {
  const result = db.exec(
    `
      SELECT COUNT(*)
      FROM payments
      WHERE user_id = ?
        AND debt_id = ?
        AND id <> ?
        AND (debt_status_after IS NOT NULL OR debt_balance_after_cents IS NOT NULL)
        AND paid_at >= ?
    `,
    [userId, debtId, ignoredPaymentId, paidAt],
  );

  return Number(result[0]?.values[0]?.[0] ?? 0) > 0;
}

function hasCashAccountLinks(db: Database, userId: string, accountId: string) {
  const result = db.exec(
    `
      SELECT
        (SELECT COUNT(*) FROM income WHERE user_id = ? AND destination_account_id = ?) +
        (SELECT COUNT(*) FROM payments WHERE user_id = ? AND account_id = ?) +
        (SELECT COUNT(*) FROM account_movements WHERE user_id = ? AND (from_account_id = ? OR to_account_id = ?))
    `,
    [userId, accountId, userId, accountId, userId, accountId, accountId],
  );

  return Number(result[0]?.values[0]?.[0] ?? 0) > 0;
}

function findNegotiationById(db: Database, userId: string, negotiationId: string) {
  const result = db.exec(
    `
      SELECT
        negotiations.id, negotiations.user_id, negotiations.debt_id, debts.creditor_name,
        negotiations.contact_date, negotiations.contact_method, negotiations.representative, negotiations.phone_or_portal,
        negotiations.balance_cents, negotiations.current_offer_cents, negotiations.user_offer_cents, negotiations.counter_offer_cents,
        negotiations.final_agreement_cents, negotiations.number_of_payments, negotiations.due_date,
        negotiations.written_agreement_received, negotiations.pay_for_delete_included,
        negotiations.offer_expires_at, negotiations.follow_up_at, negotiations.status, negotiations.notes,
        negotiations.created_at, negotiations.updated_at
      FROM negotiations
      LEFT JOIN debts ON debts.id = negotiations.debt_id AND debts.user_id = negotiations.user_id
      WHERE negotiations.id = ? AND negotiations.user_id = ?
    `,
    [negotiationId, userId],
  );
  const row = result[0]?.values[0];
  return row ? toNegotiation(row) : undefined;
}

function toDebt(row: unknown[]): Debt {
  return {
    id: String(row[0]),
    userId: String(row[1]),
    priority: Number(row[2]),
    priorityScore: Number(row[3]),
    trackedAt: String(row[4] || row[12]),
    creditorName: String(row[5]),
    category: normalizeDebtCategory(String(row[14] ?? "OTHER")),
    balanceCents: Number(row[6]),
    settlementCents: row[7] === null || row[7] === undefined ? null : Number(row[7]),
    pastDueCents: row[22] === null || row[22] === undefined ? null : Number(row[22]),
    aprBasisPoints: row[15] === null || row[15] === undefined ? null : Number(row[15]),
    minimumPaymentCents: row[16] === null || row[16] === undefined ? null : Number(row[16]),
    monthsBehind: row[17] === null || row[17] === undefined ? null : Number(row[17]),
    targetDate: row[18] === null || row[18] === undefined || row[18] === "" ? null : String(row[18]),
    settlementExpiresAt: row[19] === null || row[19] === undefined || row[19] === "" ? null : String(row[19]),
    status: normalizeDebtStatus(String(row[8] ?? "OPEN")),
    reported: Number(row[9]) === 1,
    payForDelete: Number(row[20]) === 1,
    negotiable: Number(row[21]) === 1,
    reason: String(row[10] ?? ""),
    notes: String(row[11] ?? ""),
    createdAt: String(row[12]),
    updatedAt: String(row[13]),
  };
}

function toDebtSnapshot(row: unknown[]): DebtSnapshot {
  return {
    id: String(row[0]),
    userId: String(row[1]),
    debtId: row[2] === null || row[2] === undefined ? null : String(row[2]),
    creditorName: String(row[3] ?? "Removed debt"),
    balanceCents: Number(row[4] ?? 0),
    obligationCents: Number(row[5] ?? 0),
    status: normalizeDebtStatus(String(row[6] ?? "OPEN")),
    reason: normalizeDebtSnapshotReason(String(row[7] ?? "DEBT_UPDATED")),
    sourceId: row[8] === null || row[8] === undefined ? null : String(row[8]),
    snapshotAt: String(row[9]),
    notes: String(row[10] ?? ""),
    createdAt: String(row[11]),
    updatedAt: String(row[12]),
  };
}

function toIncome(row: unknown[]): Income {
  const amountCents = Number(row[3]);
  const grossAmountCents = row[8] === undefined ? amountCents : Number(row[9]);
  const feesCents = row[10] === undefined ? 0 : Number(row[10]);
  const taxWithholdingCents = row[11] === undefined ? 0 : Number(row[11]);
  const netAmountCents = row[12] === undefined ? amountCents : Number(row[12]);
  const allocatedAmountCents = row[13] === undefined ? 0 : Number(row[13]);
  const topstepAccountCount = nullableNumber(row[14]);

  return {
    id: String(row[0]),
    userId: String(row[1]),
    accountId: row[22] === null || row[22] === undefined ? null : String(row[22]),
    accountName: row[23] === null || row[23] === undefined ? null : String(row[23]),
    accountType: row[24] === null || row[24] === undefined ? null : normalizeFinancialAccountType(String(row[24])),
    destinationAccountId: row[25] === null || row[25] === undefined ? null : String(row[25]),
    destinationAccountName: row[26] === null || row[26] === undefined ? null : String(row[26]),
    destinationAccountType: row[27] === null || row[27] === undefined ? null : normalizeFinancialAccountType(String(row[27])),
    source: String(row[2]),
    sourceType: normalizeIncomeSourceType(String(row[8] ?? "OTHER")),
    amountCents: netAmountCents,
    grossAmountCents,
    feesCents,
    taxWithholdingCents,
    netAmountCents,
    allocatedAmountCents,
    remainingAmountCents: netAmountCents - allocatedAmountCents,
    topstepAccountCount,
    topstepCopiedAccounts: Number(row[15] ?? 0) === 1,
    topstepPayoutScope: normalizeTopstepPayoutScope(row[16]),
    topstepSelectedAccount: nullableNumber(row[17]),
    topstepProfitPerAccountCents: nullableNumber(row[18]),
    topstepTotalProfitCents: nullableNumber(row[19]),
    topstepWithdrawableCents: nullableNumber(row[20]),
    topstepFeeCents: nullableNumber(row[21]),
    receivedAt: String(row[4]),
    notes: String(row[5] ?? ""),
    createdAt: String(row[6]),
    updatedAt: String(row[7]),
  };
}

function toNegotiation(row: unknown[]): Negotiation {
  return {
    id: String(row[0]),
    userId: String(row[1]),
    debtId: row[2] === null || row[2] === undefined ? null : String(row[2]),
    debtName: row[3] === null || row[3] === undefined ? null : String(row[3]),
    contactDate: String(row[4]),
    contactMethod: normalizeNegotiationContactMethod(String(row[5] ?? "PHONE")),
    representative: String(row[6] ?? ""),
    phoneOrPortal: String(row[7] ?? ""),
    balanceCents: nullableNumber(row[8]),
    currentOfferCents: nullableNumber(row[9]),
    userOfferCents: nullableNumber(row[10]),
    counterOfferCents: nullableNumber(row[11]),
    finalAgreementCents: nullableNumber(row[12]),
    numberOfPayments: nullableNumber(row[13]),
    dueDate: row[14] === null || row[14] === undefined ? null : String(row[14]),
    writtenAgreementReceived: Boolean(Number(row[15])),
    payForDeleteIncluded: Boolean(Number(row[16])),
    offerExpiresAt: row[17] === null || row[17] === undefined ? null : String(row[17]),
    followUpAt: row[18] === null || row[18] === undefined ? null : String(row[18]),
    status: normalizeNegotiationStatus(String(row[19] ?? "CONTACTED")),
    notes: String(row[20] ?? ""),
    createdAt: String(row[21]),
    updatedAt: String(row[22]),
  };
}

function toFinancialAccount(row: unknown[]): FinancialAccount {
  return {
    id: String(row[0]),
    userId: String(row[1]),
    name: String(row[2]),
    accountType: normalizeFinancialAccountType(String(row[3] ?? "OTHER")),
    institution: String(row[4] ?? ""),
    availableBalanceCents: Number(row[5] ?? 0),
    maxSubAccounts: nullableNumber(row[6]),
    copiedAccounts: Number(row[7] ?? 1) === 1,
    tradingAccountProfitsCents: parseCentsArray(row[8]),
    payoutLimitBasisPoints: nullableNumber(row[9]),
    feeBasisPoints: nullableNumber(row[10]),
    notes: String(row[11] ?? ""),
    createdAt: String(row[12]),
    updatedAt: String(row[13]),
  };
}

function toAccountMovement(row: unknown[]): AccountMovement {
  return {
    id: String(row[0]),
    userId: String(row[1]),
    movementType: normalizeAccountMovementType(String(row[2] ?? "ADJUSTMENT")),
    fromAccountId: row[3] === null || row[3] === undefined ? null : String(row[3]),
    fromAccountName: row[4] === null || row[4] === undefined ? null : String(row[4]),
    fromAccountType: row[5] === null || row[5] === undefined ? null : normalizeFinancialAccountType(String(row[5])),
    toAccountId: row[6] === null || row[6] === undefined ? null : String(row[6]),
    toAccountName: row[7] === null || row[7] === undefined ? null : String(row[7]),
    toAccountType: row[8] === null || row[8] === undefined ? null : normalizeFinancialAccountType(String(row[8])),
    amountCents: Number(row[9]),
    occurredAt: String(row[10]),
    notes: String(row[11] ?? ""),
    createdAt: String(row[12]),
    updatedAt: String(row[13]),
  };
}

function toPayment(row: unknown[]): Payment {
  return {
    id: String(row[0]),
    userId: String(row[1]),
    debtId: row[2] === null || row[2] === undefined ? null : String(row[2]),
    debtName: row[3] === null || row[3] === undefined ? null : String(row[3]),
    accountId: row[15] === null || row[15] === undefined ? null : String(row[15]),
    accountName: row[16] === null || row[16] === undefined ? null : String(row[16]),
    accountType: row[17] === null || row[17] === undefined ? null : normalizeFinancialAccountType(String(row[17])),
    amountCents: Number(row[4]),
    paymentType: normalizePaymentType(String(row[9] ?? "REGULAR")),
    principalCents: row[10] === null || row[10] === undefined ? null : Number(row[10]),
    interestAndFeesCents: row[11] === null || row[11] === undefined ? null : Number(row[11]),
    resultingBalanceCents: row[12] === null || row[12] === undefined ? null : Number(row[12]),
    confirmationNumber: String(row[13] ?? ""),
    paymentMethod: String(row[14] ?? ""),
    paidAt: String(row[5]),
    notes: String(row[6] ?? ""),
    createdAt: String(row[7]),
    updatedAt: String(row[8]),
  };
}

function toPayoffSettings(row: unknown[]): PayoffSettings {
  return {
    userId: String(row[0]),
    monthlyBudgetCents: Number(row[1]),
    strategy: normalizePayoffStrategy(String(row[2])),
    updatedAt: String(row[3]),
    emergencyReserveCents: row[4] === undefined ? 0 : Number(row[4]),
    maxAccountsPerRound: row[5] === null || row[5] === undefined ? null : Number(row[5]),
    budgetFrequency: normalizePayoffBudgetFrequency(String(row[6] ?? "MONTHLY")),
    manualAllocations: parseStoredManualAllocations(row[7]),
  };
}

function toPayoffMilestone(row: unknown[]): PayoffMilestone {
  return {
    id: String(row[0]),
    userId: String(row[1]),
    budgetFrequency: normalizePayoffBudgetFrequency(String(row[2] ?? "MONTHLY")),
    periodStart: String(row[3]),
    periodEnd: String(row[4]),
    targetCents: Number(row[5]),
    paidCents: Number(row[6]),
    status: normalizePayoffMilestoneStatus(String(row[7] ?? "ACTIVE")),
    completedAt: row[8] === null || row[8] === undefined ? null : String(row[8]),
    createdAt: String(row[9]),
    updatedAt: String(row[10]),
  };
}

function normalizePriorityScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

const debtStatuses: DebtStatus[] = ["OPEN", "PAST_DUE", "COLLECTION", "CLOSED", "NOT_REPORTED", "SETTLED"];
const debtSnapshotReasons: DebtSnapshotReason[] = ["DEBT_CREATED", "DEBT_UPDATED", "DEBT_DELETED", "PAYMENT_RECORDED", "PAYMENT_EDITED", "PAYMENT_DELETED"];

function isDebtStatus(value: unknown): value is DebtStatus {
  return typeof value === "string" && debtStatuses.includes(value as DebtStatus);
}

function normalizeDebtStatus(value: string): DebtStatus {
  if (isDebtStatus(value)) {
    return value;
  }

  return "OPEN";
}

function normalizeDebtSnapshotReason(value: string): DebtSnapshotReason {
  if (debtSnapshotReasons.includes(value as DebtSnapshotReason)) {
    return value as DebtSnapshotReason;
  }

  return "DEBT_UPDATED";
}

function normalizeDebtCategory(value: string): DebtCategory {
  if (
    value === "AUTO_LOAN" ||
    value === "CREDIT_CARD" ||
    value === "COLLECTION" ||
    value === "PERSONAL_LOAN" ||
    value === "BNPL" ||
    value === "RETAIL_FINANCING" ||
    value === "MEDICAL" ||
    value === "UTILITY"
  ) {
    return value;
  }
  return "OTHER";
}

function normalizePayoffStrategy(value: string): PayoffStrategy {
  if (
    value === "HYBRID" ||
    value === "EMERGENCY_FIRST" ||
    value === "CREDIT_REPAIR_FIRST" ||
    value === "SNOWBALL" ||
    value === "AVALANCHE" ||
    value === "SETTLEMENT_FIRST" ||
    value === "MANUAL" ||
    value === "PRIORITY" ||
    value === "LOW_BALANCE" ||
    value === "HIGH_BALANCE" ||
    value === "SETTLEMENT"
  ) {
    return value;
  }
  return "HYBRID";
}

function normalizePayoffBudgetFrequency(value: string): PayoffBudgetFrequency {
  if (value === "WEEKLY" || value === "YEARLY") return value;
  return "MONTHLY";
}

function normalizePayoffMilestoneStatus(value: string): PayoffMilestoneStatus {
  return value === "DONE" ? "DONE" : "ACTIVE";
}

function normalizeDateKey(value: string, label: string) {
  const cleanDate = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) throw new Error(`${label} must use YYYY-MM-DD.`);
  return cleanDate;
}

function parseManualAllocationInput(input: Record<string, string>) {
  const allocations: Record<string, number> = {};
  for (const [debtId, value] of Object.entries(input)) {
    if (!debtId || !value.trim()) continue;
    allocations[debtId] = parseMoneyToCents(value);
  }
  return allocations;
}

function parseStoredManualAllocations(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, number] => typeof entry[0] === "string" && typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0)
        .map(([debtId, cents]) => [debtId, Math.round(cents)]),
    );
  } catch {
    return {};
  }
}

function normalizeIncomeSourceType(value: string): IncomeSourceType {
  if (value === "EMPLOYMENT" || value === "TOPSTEP" || value === "BUSINESS" || value === "REFUND" || value === "BENEFITS") {
    return value;
  }
  return "OTHER";
}

function normalizeFinancialAccountType(value: string): FinancialAccountType {
  if (value === "BANK" || value === "TRADING") return value;
  return "OTHER";
}

function normalizeAccountMovementType(value: string): AccountMovementType {
  if (value === "TRANSFER") return value;
  return "ADJUSTMENT";
}

function normalizeTopstepPayoutScope(value: unknown): TopstepPayoutScope | null {
  if (value === "ALL_ACCOUNTS" || value === "SINGLE_ACCOUNT") return value;
  return null;
}

function normalizePaymentType(value: string): PaymentType {
  if (value === "MINIMUM" || value === "CATCH_UP" || value === "EXTRA" || value === "SETTLEMENT" || value === "PAYOFF") {
    return value;
  }
  return "REGULAR";
}

function normalizeNegotiationContactMethod(value: string): NegotiationContactMethod {
  if (value === "PHONE" || value === "PORTAL" || value === "EMAIL" || value === "MAIL" || value === "CHAT") {
    return value;
  }
  return "OTHER";
}

function normalizeNegotiationStatus(value: string): NegotiationStatus {
  if (
    value === "PLANNED" ||
    value === "CONTACTED" ||
    value === "OFFER_SENT" ||
    value === "COUNTERED" ||
    value === "ACCEPTED" ||
    value === "DECLINED" ||
    value === "FOLLOW_UP" ||
    value === "CLOSED"
  ) {
    return value;
  }
  return "CONTACTED";
}

function applyIncomeAccountBalanceChange(
  db: Database,
  userId: string,
  existingIncome: Income | undefined,
  input: IncomeInput,
  nextAccountId: string | null,
  nextDestinationAccountId: string | null,
  netAmountCents: number,
) {
  if (existingIncome) restoreIncomeAccountMovements(db, userId, existingIncome);

  if (nextAccountId) {
    adjustAccountFromInput(db, userId, nextAccountId, input, -1);
  }

  if (nextDestinationAccountId) {
    adjustFinancialAccountBalance(db, userId, nextDestinationAccountId, netAmountCents);
  }
}

function restoreIncomeAccountMovements(db: Database, userId: string, income: Income) {
  if (income.accountId) {
    adjustAccountFromIncome(db, userId, income, 1);
  }

  if (income.destinationAccountId) {
    adjustFinancialAccountBalance(db, userId, income.destinationAccountId, -income.netAmountCents);
  }
}

function restorePaymentAccountMovement(db: Database, userId: string, payment: Payment) {
  if (!payment.accountId) return;
  adjustFinancialAccountBalance(db, userId, payment.accountId, payment.amountCents);
}

function restoreAccountMovement(db: Database, userId: string, movement: AccountMovement) {
  applyAccountMovement(db, userId, movement.toAccountId, movement.fromAccountId, movement.amountCents);
}

function applyAccountMovement(db: Database, userId: string, fromAccountId: string | null, toAccountId: string | null, amountCents: number) {
  if (fromAccountId) adjustFinancialAccountBalance(db, userId, fromAccountId, -amountCents);
  if (toAccountId) adjustFinancialAccountBalance(db, userId, toAccountId, amountCents);
}

function validateCashMovementAccount(db: Database, userId: string, accountId: string | null, label: string) {
  if (!accountId) return;
  const account = findFinancialAccountById(db, userId, accountId);
  if (!account) throw new Error(`${label} could not be found.`);
  if (account.accountType === "TRADING") throw new Error("Transfers and adjustments can only use bank or cash accounts.");
}

function restoreFinancialAccountFromIncome(account: FinancialAccount, income: Income) {
  if (income.accountId !== account.id) return account;

  if (account.accountType !== "TRADING") {
    return {
      ...account,
      availableBalanceCents: account.availableBalanceCents + income.grossAmountCents,
    };
  }

  const accountCount = Math.max(1, Math.min(5, account.maxSubAccounts ?? income.topstepAccountCount ?? 1));
  const currentProfits = account.tradingAccountProfitsCents.length
    ? account.tradingAccountProfitsCents
    : Array.from({ length: accountCount }, () => account.availableBalanceCents);
  const restoredProfits = Array.from({ length: accountCount }, (_, index) => currentProfits[index] ?? account.availableBalanceCents);
  const amountPerAccountCents = getAccountBalanceDeltaFromIncome(income, income.grossAmountCents);
  const indexes =
    income.topstepPayoutScope === "ALL_ACCOUNTS"
      ? Array.from({ length: Math.min(income.topstepAccountCount ?? accountCount, accountCount) }, (_, index) => index)
      : [Math.min(accountCount - 1, Math.max(0, (income.topstepSelectedAccount ?? 1) - 1))];

  for (const index of indexes) {
    restoredProfits[index] = restoredProfits[index] + amountPerAccountCents;
  }

  return {
    ...account,
    availableBalanceCents: restoredProfits[0] ?? account.availableBalanceCents,
    copiedAccounts: restoredProfits.every((profit) => profit === restoredProfits[0]),
    tradingAccountProfitsCents: restoredProfits,
  };
}

function adjustFinancialAccountBalance(db: Database, userId: string, accountId: string, deltaCents: number) {
  db.run(
    `
      UPDATE financial_accounts
      SET available_balance_cents = available_balance_cents + ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    [deltaCents, new Date().toISOString(), accountId, userId],
  );
}

function getAccountBalanceDeltaFromIncome(income: Income, grossAmountCents: number) {
  if (income.accountType === "TRADING" && income.topstepPayoutScope === "ALL_ACCOUNTS") {
    return Math.round(grossAmountCents / Math.max(1, income.topstepAccountCount ?? 1));
  }
  return grossAmountCents;
}

function getAccountBalanceDeltaFromInput(input: IncomeInput) {
  return parseMoneyToCents(input.grossAmount);
}

function adjustAccountFromIncome(db: Database, userId: string, income: Income, direction: 1 | -1) {
  if (!income.accountId) return;
  const account = findFinancialAccountById(db, userId, income.accountId);
  if (!account) return;
  if (account.accountType !== "TRADING") {
    adjustFinancialAccountBalance(db, userId, account.id, direction * income.grossAmountCents);
    return;
  }

  adjustTradingAccountProfits(db, userId, account, {
    accountCount: income.topstepAccountCount ?? account.maxSubAccounts ?? 1,
    amountPerAccountCents: getAccountBalanceDeltaFromIncome(income, income.grossAmountCents),
    direction,
    payoutScope: income.topstepPayoutScope ?? "SINGLE_ACCOUNT",
    selectedAccount: income.topstepSelectedAccount ?? 1,
  });
}

function adjustAccountFromInput(db: Database, userId: string, accountId: string, input: IncomeInput, direction: 1 | -1) {
  const account = findFinancialAccountById(db, userId, accountId);
  if (!account) return;
  if (account.accountType !== "TRADING") {
    adjustFinancialAccountBalance(db, userId, account.id, direction * parseMoneyToCents(input.grossAmount));
    return;
  }

  adjustTradingAccountProfits(db, userId, account, {
    accountCount: parseBoundedInteger(input.topstepAccountCount, "Trading account count", 1, 5),
    amountPerAccountCents: getAccountBalanceDeltaFromInput(input),
    direction,
    payoutScope: input.topstepPayoutScope,
    selectedAccount: parseBoundedInteger(input.topstepSelectedAccount, "Selected account", 1, 5),
  });
}

function adjustTradingAccountProfits(
  db: Database,
  userId: string,
  account: FinancialAccount,
  input: {
    accountCount: number;
    amountPerAccountCents: number;
    direction: 1 | -1;
    payoutScope: TopstepPayoutScope;
    selectedAccount: number;
  },
) {
  const accountCount = Math.max(1, Math.min(5, account.maxSubAccounts ?? input.accountCount));
  const currentProfits = account.tradingAccountProfitsCents.length
    ? account.tradingAccountProfitsCents
    : Array.from({ length: accountCount }, () => account.availableBalanceCents);
  const nextProfits = Array.from({ length: accountCount }, (_, index) => currentProfits[index] ?? account.availableBalanceCents);
  const indexes =
    input.payoutScope === "ALL_ACCOUNTS"
      ? Array.from({ length: Math.min(input.accountCount, accountCount) }, (_, index) => index)
      : [Math.min(accountCount - 1, Math.max(0, input.selectedAccount - 1))];

  for (const index of indexes) {
    nextProfits[index] = Math.max(0, nextProfits[index] + input.direction * input.amountPerAccountCents);
  }

  const copiedAccounts = nextProfits.every((profit) => profit === nextProfits[0]);
  db.run(
    `
      UPDATE financial_accounts
      SET available_balance_cents = ?, copied_accounts = ?, trading_account_profits_cents = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    [nextProfits[0] ?? 0, copiedAccounts ? 1 : 0, JSON.stringify(nextProfits), new Date().toISOString(), account.id, userId],
  );
}

function getTradingGrossAmount(input: IncomeInput, amountPerAccountCents: number) {
  if (input.topstepPayoutScope !== "ALL_ACCOUNTS") return amountPerAccountCents;
  const accountCount = parseBoundedInteger(input.topstepAccountCount, "Trading account count", 1, 5);
  return amountPerAccountCents * accountCount;
}

function getTopstepDetails(input: IncomeInput, account: FinancialAccount | undefined, grossAmountCents: number) {
  const isTradingAccount = input.sourceType === "TOPSTEP" || account?.accountType === "TRADING";

  if (!isTradingAccount) {
    return {
      accountCount: null,
      copiedAccounts: false,
      feeCents: null,
      payoutScope: null,
      profitPerAccountCents: null,
      selectedAccount: null,
      totalProfitCents: null,
      withdrawableCents: null,
    };
  }

  const maxAccounts = Math.min(5, Math.max(1, account?.maxSubAccounts ?? 5));
  const payoutLimitBasisPoints = account?.payoutLimitBasisPoints ?? 5000;
  const feeBasisPoints = account?.feeBasisPoints ?? 1000;
  const accountCount = parseBoundedInteger(input.topstepAccountCount, "Trading account count", 1, maxAccounts);
  const payoutScope = input.topstepPayoutScope;
  const selectedAccount = payoutScope === "SINGLE_ACCOUNT" ? parseBoundedInteger(input.topstepSelectedAccount, "Selected account", 1, accountCount) : null;
  const profitPerAccountCents = parseMoneyToCents(input.topstepProfitPerAccount);
  const paidAccounts = payoutScope === "ALL_ACCOUNTS" ? accountCount : 1;
  const totalProfitCents = account ? getAvailableProfitForPayout(account, payoutScope, accountCount, selectedAccount ?? 1) : profitPerAccountCents * paidAccounts;
  const withdrawableCents = Math.round(totalProfitCents * (payoutLimitBasisPoints / 10000));
  const grossPayoutCents = getTradingGrossAmount(input, grossAmountCents);
  const feeCents = Math.round(grossPayoutCents * (feeBasisPoints / 10000));

  return {
    accountCount,
    copiedAccounts: input.topstepCopiedAccounts,
    feeCents,
    payoutScope,
    profitPerAccountCents,
    selectedAccount,
    totalProfitCents,
    withdrawableCents,
  };
}

function getAvailableProfitForPayout(account: FinancialAccount, payoutScope: TopstepPayoutScope, accountCount: number, selectedAccount: number) {
  const profits = account.tradingAccountProfitsCents.length
    ? account.tradingAccountProfitsCents
    : Array.from({ length: Math.max(1, accountCount) }, () => account.availableBalanceCents);

  if (payoutScope === "SINGLE_ACCOUNT") {
    return profits[Math.min(profits.length - 1, Math.max(0, selectedAccount - 1))] ?? account.availableBalanceCents;
  }
  return profits.slice(0, Math.max(1, accountCount)).reduce((sum, value) => sum + value, 0);
}

function parseMoneyToCents(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error("Money amounts must be valid numbers.");
  return Math.round(Number(cleaned) * 100);
}

function formatCentsForError(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function nullableMoneyToCents(value: string) {
  return value.trim() ? parseMoneyToCents(value) : null;
}

function parseAprToBasisPoints(value: string) {
  const cleaned = value.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error("APR must be a valid percentage.");
  return Math.round(Number(cleaned) * 100);
}

function parsePercentToBasisPoints(value: string, label: string) {
  const cleaned = value.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error(`${label} must be a valid percentage.`);
  const basisPoints = Math.round(Number(cleaned) * 100);
  if (basisPoints < 0 || basisPoints > 10000) throw new Error(`${label} must be between 0 and 100%.`);
  return basisPoints;
}

function parseNonNegativeInteger(value: string, label: string) {
  const cleaned = value.trim();
  if (!/^\d+$/.test(cleaned)) throw new Error(`${label} must be a whole number.`);
  return Number(cleaned);
}

function parseBoundedInteger(value: string, label: string, min: number, max: number) {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return parsed;
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function parseCentsArray(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item >= 0);
  } catch {
    return [];
  }
}

function getTradingAccountProfits(input: FinancialAccountInput, accountCount: number, availableBalanceCents: number) {
  if (input.accountType !== "TRADING") return [];
  if (input.copiedAccounts) {
    return Array.from({ length: accountCount }, () => availableBalanceCents);
  }
  return Array.from({ length: accountCount }, (_, index) => parseMoneyToCents(input.tradingAccountProfits[index] ?? ""));
}

function parseDateToIso(value: string, fallback: string) {
  const cleanDate = value.trim();
  if (!cleanDate) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) throw new Error("Tracked date must use YYYY-MM-DD.");
  return new Date(`${cleanDate}T12:00:00.000Z`).toISOString();
}

function parseSnapshotDateTime(value: string, fallback: string) {
  const cleanValue = value.trim();
  if (!cleanValue) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) return new Date(`${cleanValue}T12:00:00.000Z`).toISOString();
  const date = new Date(cleanValue);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function ensureDebtColumns(db: Database) {
  const columns = new Set((db.exec("PRAGMA table_info(debts)")[0]?.values ?? []).map((row) => String(row[1])));
  const additions: Array<[string, string]> = [
    ["priority", "ALTER TABLE debts ADD COLUMN priority INTEGER NOT NULL DEFAULT 1"],
    ["priority_score", "ALTER TABLE debts ADD COLUMN priority_score INTEGER NOT NULL DEFAULT 0"],
    ["tracked_at", "ALTER TABLE debts ADD COLUMN tracked_at TEXT NOT NULL DEFAULT ''"],
    ["category", "ALTER TABLE debts ADD COLUMN category TEXT NOT NULL DEFAULT 'OTHER'"],
    ["settlement_cents", "ALTER TABLE debts ADD COLUMN settlement_cents INTEGER"],
    ["past_due_cents", "ALTER TABLE debts ADD COLUMN past_due_cents INTEGER"],
    ["apr_basis_points", "ALTER TABLE debts ADD COLUMN apr_basis_points INTEGER"],
    ["minimum_payment_cents", "ALTER TABLE debts ADD COLUMN minimum_payment_cents INTEGER"],
    ["months_behind", "ALTER TABLE debts ADD COLUMN months_behind INTEGER"],
    ["target_date", "ALTER TABLE debts ADD COLUMN target_date TEXT"],
    ["settlement_expires_at", "ALTER TABLE debts ADD COLUMN settlement_expires_at TEXT"],
    ["reported", "ALTER TABLE debts ADD COLUMN reported INTEGER NOT NULL DEFAULT 0"],
    ["pay_for_delete", "ALTER TABLE debts ADD COLUMN pay_for_delete INTEGER NOT NULL DEFAULT 0"],
    ["negotiable", "ALTER TABLE debts ADD COLUMN negotiable INTEGER NOT NULL DEFAULT 0"],
    ["reason", "ALTER TABLE debts ADD COLUMN reason TEXT NOT NULL DEFAULT ''"],
  ];

  for (const [column, statement] of additions) {
    if (!columns.has(column)) db.run(statement);
  }
}

function ensureIncomeColumns(db: Database) {
  const columns = new Set((db.exec("PRAGMA table_info(income)")[0]?.values ?? []).map((row) => String(row[1])));
  const additions: Array<[string, string]> = [
    ["account_id", "ALTER TABLE income ADD COLUMN account_id TEXT"],
    ["destination_account_id", "ALTER TABLE income ADD COLUMN destination_account_id TEXT"],
    ["source_type", "ALTER TABLE income ADD COLUMN source_type TEXT NOT NULL DEFAULT 'OTHER'"],
    ["gross_amount_cents", "ALTER TABLE income ADD COLUMN gross_amount_cents INTEGER NOT NULL DEFAULT 0"],
    ["fees_cents", "ALTER TABLE income ADD COLUMN fees_cents INTEGER NOT NULL DEFAULT 0"],
    ["tax_withholding_cents", "ALTER TABLE income ADD COLUMN tax_withholding_cents INTEGER NOT NULL DEFAULT 0"],
    ["net_amount_cents", "ALTER TABLE income ADD COLUMN net_amount_cents INTEGER NOT NULL DEFAULT 0"],
    ["allocated_amount_cents", "ALTER TABLE income ADD COLUMN allocated_amount_cents INTEGER NOT NULL DEFAULT 0"],
    ["topstep_account_count", "ALTER TABLE income ADD COLUMN topstep_account_count INTEGER"],
    ["topstep_copied_accounts", "ALTER TABLE income ADD COLUMN topstep_copied_accounts INTEGER NOT NULL DEFAULT 0"],
    ["topstep_payout_scope", "ALTER TABLE income ADD COLUMN topstep_payout_scope TEXT"],
    ["topstep_selected_account", "ALTER TABLE income ADD COLUMN topstep_selected_account INTEGER"],
    ["topstep_profit_per_account_cents", "ALTER TABLE income ADD COLUMN topstep_profit_per_account_cents INTEGER"],
    ["topstep_total_profit_cents", "ALTER TABLE income ADD COLUMN topstep_total_profit_cents INTEGER"],
    ["topstep_withdrawable_cents", "ALTER TABLE income ADD COLUMN topstep_withdrawable_cents INTEGER"],
    ["topstep_fee_cents", "ALTER TABLE income ADD COLUMN topstep_fee_cents INTEGER"],
  ];

  for (const [column, statement] of additions) {
    if (!columns.has(column)) db.run(statement);
  }

  db.run(`
    UPDATE income
    SET
      gross_amount_cents = CASE WHEN gross_amount_cents = 0 THEN amount_cents ELSE gross_amount_cents END,
      net_amount_cents = CASE WHEN net_amount_cents = 0 THEN amount_cents ELSE net_amount_cents END
  `);
}

function ensureFinancialAccountColumns(db: Database) {
  const columns = new Set((db.exec("PRAGMA table_info(financial_accounts)")[0]?.values ?? []).map((row) => String(row[1])));
  const additions: Array<[string, string]> = [
    ["institution", "ALTER TABLE financial_accounts ADD COLUMN institution TEXT NOT NULL DEFAULT ''"],
    ["available_balance_cents", "ALTER TABLE financial_accounts ADD COLUMN available_balance_cents INTEGER NOT NULL DEFAULT 0"],
    ["max_sub_accounts", "ALTER TABLE financial_accounts ADD COLUMN max_sub_accounts INTEGER"],
    ["copied_accounts", "ALTER TABLE financial_accounts ADD COLUMN copied_accounts INTEGER NOT NULL DEFAULT 1"],
    ["trading_account_profits_cents", "ALTER TABLE financial_accounts ADD COLUMN trading_account_profits_cents TEXT NOT NULL DEFAULT '[]'"],
    ["payout_limit_basis_points", "ALTER TABLE financial_accounts ADD COLUMN payout_limit_basis_points INTEGER"],
    ["fee_basis_points", "ALTER TABLE financial_accounts ADD COLUMN fee_basis_points INTEGER"],
    ["notes", "ALTER TABLE financial_accounts ADD COLUMN notes TEXT NOT NULL DEFAULT ''"],
  ];

  for (const [column, statement] of additions) {
    if (!columns.has(column)) db.run(statement);
  }
}

function ensurePaymentColumns(db: Database) {
  const columns = new Set((db.exec("PRAGMA table_info(payments)")[0]?.values ?? []).map((row) => String(row[1])));
  const additions: Array<[string, string]> = [
    ["account_id", "ALTER TABLE payments ADD COLUMN account_id TEXT"],
    ["payment_type", "ALTER TABLE payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'REGULAR'"],
    ["principal_cents", "ALTER TABLE payments ADD COLUMN principal_cents INTEGER"],
    ["interest_and_fees_cents", "ALTER TABLE payments ADD COLUMN interest_and_fees_cents INTEGER"],
    ["resulting_balance_cents", "ALTER TABLE payments ADD COLUMN resulting_balance_cents INTEGER"],
    ["confirmation_number", "ALTER TABLE payments ADD COLUMN confirmation_number TEXT NOT NULL DEFAULT ''"],
    ["payment_method", "ALTER TABLE payments ADD COLUMN payment_method TEXT NOT NULL DEFAULT ''"],
    ["debt_status_before", "ALTER TABLE payments ADD COLUMN debt_status_before TEXT"],
    ["debt_status_after", "ALTER TABLE payments ADD COLUMN debt_status_after TEXT"],
    ["debt_balance_before_cents", "ALTER TABLE payments ADD COLUMN debt_balance_before_cents INTEGER"],
    ["debt_balance_after_cents", "ALTER TABLE payments ADD COLUMN debt_balance_after_cents INTEGER"],
  ];

  for (const [column, statement] of additions) {
    if (!columns.has(column)) db.run(statement);
  }
}

function ensureNegotiationColumns(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS negotiations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      debt_id TEXT REFERENCES debts(id) ON DELETE SET NULL,
      contact_date TEXT NOT NULL,
      contact_method TEXT NOT NULL DEFAULT 'PHONE',
      representative TEXT NOT NULL DEFAULT '',
      phone_or_portal TEXT NOT NULL DEFAULT '',
      balance_cents INTEGER,
      current_offer_cents INTEGER,
      user_offer_cents INTEGER,
      counter_offer_cents INTEGER,
      final_agreement_cents INTEGER,
      number_of_payments INTEGER,
      due_date TEXT,
      written_agreement_received INTEGER NOT NULL DEFAULT 0,
      pay_for_delete_included INTEGER NOT NULL DEFAULT 0,
      offer_expires_at TEXT,
      follow_up_at TEXT,
      status TEXT NOT NULL DEFAULT 'CONTACTED',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function ensurePayoffSettingsColumns(db: Database) {
  const columns = new Set((db.exec("PRAGMA table_info(payoff_settings)")[0]?.values ?? []).map((row) => String(row[1])));
  if (!columns.has("emergency_reserve_cents")) {
    db.run("ALTER TABLE payoff_settings ADD COLUMN emergency_reserve_cents INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.has("max_accounts_per_round")) {
    db.run("ALTER TABLE payoff_settings ADD COLUMN max_accounts_per_round INTEGER");
  }
  if (!columns.has("budget_frequency")) {
    db.run("ALTER TABLE payoff_settings ADD COLUMN budget_frequency TEXT NOT NULL DEFAULT 'MONTHLY'");
  }
  if (!columns.has("manual_allocations_json")) {
    db.run("ALTER TABLE payoff_settings ADD COLUMN manual_allocations_json TEXT NOT NULL DEFAULT '{}'");
  }
}

async function getSql() {
  sqlPromise ??= initSqlJs({ locateFile: () => getSqlWasmLocation() });
  return sqlPromise;
}

function getSqlWasmLocation() {
  if (import.meta.env.MODE === "test" && wasmUrl.startsWith("/node_modules/")) {
    return wasmUrl.slice(1);
  }

  return wasmUrl;
}

async function openStore(mode: IDBTransactionMode) {
  const request = indexedDB.open(idbName, 1);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore(idbStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database.transaction(idbStore, mode).objectStore(idbStore);
}

async function readDatabaseBytes() {
  const store = await openStore("readonly");
  const request = store.get(idbKey);
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    request.onsuccess = () => {
      const value = request.result as Uint8Array | undefined;
      resolve(value ? new Uint8Array(value) : undefined);
    };
    request.onerror = () => reject(request.error);
  });
}

async function writeDatabaseBytes(bytes: Uint8Array) {
  const store = await openStore("readwrite");
  const request = store.put(bytes, idbKey);
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 1,
    priority_score INTEGER NOT NULL DEFAULT 0,
    tracked_at TEXT NOT NULL,
    creditor_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'OTHER',
    balance_cents INTEGER NOT NULL DEFAULT 0,
    settlement_cents INTEGER,
    past_due_cents INTEGER,
    apr_basis_points INTEGER,
    minimum_payment_cents INTEGER,
    months_behind INTEGER,
    target_date TEXT,
    settlement_expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    reported INTEGER NOT NULL DEFAULT 0,
    pay_for_delete INTEGER NOT NULL DEFAULT 0,
    negotiable INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS debt_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    debt_id TEXT REFERENCES debts(id) ON DELETE SET NULL,
    creditor_name TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    obligation_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN',
    reason TEXT NOT NULL DEFAULT 'DEBT_UPDATED',
    source_id TEXT,
    snapshot_at TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS financial_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'OTHER',
    institution TEXT NOT NULL DEFAULT '',
    available_balance_cents INTEGER NOT NULL DEFAULT 0,
    max_sub_accounts INTEGER,
    copied_accounts INTEGER NOT NULL DEFAULT 1,
    trading_account_profits_cents TEXT NOT NULL DEFAULT '[]',
    payout_limit_basis_points INTEGER,
    fee_basis_points INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS account_movements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL DEFAULT 'ADJUSTMENT',
    from_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL,
    to_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    occurred_at TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS income (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL,
    destination_account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'OTHER',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    gross_amount_cents INTEGER NOT NULL DEFAULT 0,
    fees_cents INTEGER NOT NULL DEFAULT 0,
    tax_withholding_cents INTEGER NOT NULL DEFAULT 0,
    net_amount_cents INTEGER NOT NULL DEFAULT 0,
    allocated_amount_cents INTEGER NOT NULL DEFAULT 0,
    topstep_account_count INTEGER,
    topstep_copied_accounts INTEGER NOT NULL DEFAULT 0,
    topstep_payout_scope TEXT,
    topstep_selected_account INTEGER,
    topstep_profit_per_account_cents INTEGER,
    topstep_total_profit_cents INTEGER,
    topstep_withdrawable_cents INTEGER,
    topstep_fee_cents INTEGER,
    received_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    debt_id TEXT REFERENCES debts(id) ON DELETE SET NULL,
    account_id TEXT REFERENCES financial_accounts(id) ON DELETE SET NULL,
    payment_type TEXT NOT NULL DEFAULT 'REGULAR',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    principal_cents INTEGER,
    interest_and_fees_cents INTEGER,
    resulting_balance_cents INTEGER,
    confirmation_number TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    debt_status_before TEXT,
    debt_status_after TEXT,
    debt_balance_before_cents INTEGER,
    debt_balance_after_cents INTEGER,
    paid_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS negotiations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    debt_id TEXT REFERENCES debts(id) ON DELETE SET NULL,
    contact_date TEXT NOT NULL,
    contact_method TEXT NOT NULL DEFAULT 'PHONE',
    representative TEXT NOT NULL DEFAULT '',
    phone_or_portal TEXT NOT NULL DEFAULT '',
    balance_cents INTEGER,
    current_offer_cents INTEGER,
    user_offer_cents INTEGER,
    counter_offer_cents INTEGER,
    final_agreement_cents INTEGER,
    number_of_payments INTEGER,
    due_date TEXT,
    written_agreement_received INTEGER NOT NULL DEFAULT 0,
    pay_for_delete_included INTEGER NOT NULL DEFAULT 0,
    offer_expires_at TEXT,
    follow_up_at TEXT,
    status TEXT NOT NULL DEFAULT 'CONTACTED',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payoff_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    monthly_budget_cents INTEGER NOT NULL DEFAULT 0,
    budget_frequency TEXT NOT NULL DEFAULT 'MONTHLY',
    emergency_reserve_cents INTEGER NOT NULL DEFAULT 0,
    max_accounts_per_round INTEGER,
    manual_allocations_json TEXT NOT NULL DEFAULT '{}',
    strategy TEXT NOT NULL DEFAULT 'HYBRID',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payoff_milestones (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    budget_frequency TEXT NOT NULL DEFAULT 'MONTHLY',
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    target_cents INTEGER NOT NULL DEFAULT 0,
    paid_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, budget_frequency, period_start, period_end)
  );

  CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);
  CREATE INDEX IF NOT EXISTS idx_debt_snapshots_user ON debt_snapshots(user_id);
  CREATE INDEX IF NOT EXISTS idx_debt_snapshots_debt ON debt_snapshots(debt_id);
  CREATE INDEX IF NOT EXISTS idx_financial_accounts_user ON financial_accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_account_movements_user ON account_movements(user_id);
  CREATE INDEX IF NOT EXISTS idx_account_movements_from_account ON account_movements(from_account_id);
  CREATE INDEX IF NOT EXISTS idx_account_movements_to_account ON account_movements(to_account_id);
  CREATE INDEX IF NOT EXISTS idx_income_user ON income(user_id);
  CREATE INDEX IF NOT EXISTS idx_negotiations_user ON negotiations(user_id);
  CREATE INDEX IF NOT EXISTS idx_negotiations_debt ON negotiations(debt_id);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  CREATE INDEX IF NOT EXISTS idx_payoff_milestones_user ON payoff_milestones(user_id);
`;
