import { useCallback, useEffect, useState } from "react";
import type { Database } from "sql.js";
import { AppShell, type AppPage } from "./components/AppShell";
import { ConfirmDialog } from "./components/ConfirmDialog";
import {
  clearSessionUserId,
  deleteAccountMovement,
  deleteDebt,
  deleteFinancialAccount,
  exportUserBackup,
  findUserById,
  getDashboardStats,
  getPayoffSettings,
  getSessionUserId,
  importUserBackup,
  deleteNegotiation,
  deletePayment,
  listFinancialAccounts,
  listAccountMovements,
  listIncome,
  listDebts,
  listNegotiations,
  listPayoffMilestones,
  listPayments,
  loginUser,
  openDatabase,
  setSessionUserId,
  deleteIncome,
  upsertDebt,
  upsertAccountMovement,
  upsertFinancialAccount,
  upsertIncome,
  upsertNegotiation,
  upsertPayoffMilestone,
  upsertPayoffSettings,
  upsertPayment,
  upsertUser,
  type BackupImportMode,
  type BackupImportSummary,
  type GoXPlanBackup,
} from "./db/localDatabase";
import { knownDebts } from "./data/knownDebts";
import { AuthPage } from "./features/auth/AuthPage";
import { AccountsPage } from "./features/accounts/AccountsPage";
import { BackupPage } from "./features/backup/BackupPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { DebtsPage } from "./features/debts/DebtsPage";
import { IncomePage } from "./features/income/IncomePage";
import { NegotiationsPage } from "./features/negotiations/NegotiationsPage";
import { PayoffPlanPage } from "./features/payoff/PayoffPlanPage";
import { PaymentsPage } from "./features/payments/PaymentsPage";
import { buildPayoffPeriodProgress } from "./lib/payoffPeriods";
import { ReportsPage } from "./features/reports/ReportsPage";
import { getInitialTheme, saveTheme, type Theme } from "./theme/theme";
import type {
  AccountMovement,
  AccountMovementInput,
  DashboardStats,
  Debt,
  DebtInput,
  FinancialAccount,
  FinancialAccountInput,
  Income,
  IncomeInput,
  LoginInput,
  Negotiation,
  NegotiationInput,
  Payment,
  PaymentInput,
  PayoffMilestone,
  PayoffSettings,
  PayoffSettingsInput,
  PublicUser,
  SignupInput,
} from "./types";

const emptyStats: DashboardStats = { debts: 0, income: 0, negotiations: 0, payments: 0 };
const emptyPayoffSettings: PayoffSettings = {
  userId: "",
  monthlyBudgetCents: 0,
  budgetFrequency: "MONTHLY",
  emergencyReserveCents: 0,
  maxAccountsPerRound: null,
  manualAllocations: {},
  strategy: "HYBRID",
  updatedAt: new Date().toISOString(),
};

const pagePaths: Record<AppPage, string> = {
  dashboard: "/dashboard",
  debts: "/debts",
  accounts: "/accounts",
  income: "/income",
  negotiations: "/negotiations",
  payments: "/payments",
  reports: "/reports",
  payoff: "/payoff",
  backup: "/backup",
};

async function syncPayoffMilestoneFromRecords(
  database: Database,
  userId: string,
  settings: PayoffSettings,
  payments: Payment[],
  referenceDate?: string,
) {
  if (settings.monthlyBudgetCents <= 0) return;
  const progress = buildPayoffPeriodProgress(
    settings.budgetFrequency,
    settings.monthlyBudgetCents,
    payments,
    referenceDate ? new Date(referenceDate) : new Date(),
  );

  await upsertPayoffMilestone(database, userId, {
    budgetFrequency: progress.budgetFrequency,
    paidCents: progress.paidCents,
    periodEnd: progress.periodEnd,
    periodStart: progress.periodStart,
    targetCents: progress.targetCents,
  });
}

type ConfirmDialogState = {
  confirmLabel: string;
  message: string;
  tone?: "danger" | "neutral";
  title: string;
  onConfirm: () => Promise<void>;
};

export function App() {
  const [db, setDb] = useState<Database>();
  const [user, setUser] = useState<PublicUser>();
  const [page, setPage] = useState<AppPage>(() => getPageFromPath() ?? "dashboard");
  const [stats, setStats] = useState(emptyStats);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [accountMovements, setAccountMovements] = useState<AccountMovement[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentDraft, setPaymentDraft] = useState<PaymentInput>();
  const [payoffMilestones, setPayoffMilestones] = useState<PayoffMilestone[]>([]);
  const [payoffSettings, setPayoffSettings] = useState<PayoffSettings>(emptyPayoffSettings);
  const [payoffHasUnsavedChanges, setPayoffHasUnsavedChanges] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>();
  const [isConfirming, setIsConfirming] = useState(false);
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const database = await openDatabase();
        const sessionUserId = getSessionUserId();
        const sessionUser = sessionUserId ? findUserById(database, sessionUserId) : undefined;

        if (cancelled) return;
        setDb(database);
        if (sessionUser) {
          const routePage = getPageFromPath() ?? "dashboard";
          setUser(sessionUser);
          setPage(routePage);
          setStats(getDashboardStats(database, sessionUser.id));
          setDebts(listDebts(database, sessionUser.id));
          setFinancialAccounts(listFinancialAccounts(database, sessionUser.id));
          setAccountMovements(listAccountMovements(database, sessionUser.id));
          setIncome(listIncome(database, sessionUser.id));
          setNegotiations(listNegotiations(database, sessionUser.id));
          const sessionPayments = listPayments(database, sessionUser.id);
          const sessionPayoffSettings = getPayoffSettings(database, sessionUser.id);
          await syncPayoffMilestoneFromRecords(database, sessionUser.id, sessionPayoffSettings, sessionPayments);
          setPayments(sessionPayments);
          setPayoffSettings(sessionPayoffSettings);
          setPayoffMilestones(listPayoffMilestones(database, sessionUser.id));
          if (window.location.pathname === "/auth" || !getPageFromPath()) {
            replaceUrl(routePage);
          }
        } else if (window.location.pathname !== "/auth") {
          window.history.replaceState(null, "", "/auth");
        }
      } catch (error) {
        if (!cancelled) {
          setStartupError(error instanceof Error ? error.message : "Could not start GoXPlan.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      setPage(getPageFromPath() ?? "dashboard");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  async function handleSignup(input: SignupInput) {
    if (!db) throw new Error("GoXPlan is still starting. Please try again.");
    const nextUser = await upsertUser(db, input);
    setSessionUserId(nextUser.id);
    setUser(nextUser);
    navigateToPage(getPageFromPath() ?? "dashboard", true);
    setStats(getDashboardStats(db, nextUser.id));
    setDebts(listDebts(db, nextUser.id));
    setFinancialAccounts(listFinancialAccounts(db, nextUser.id));
    setAccountMovements(listAccountMovements(db, nextUser.id));
    setIncome(listIncome(db, nextUser.id));
    setNegotiations(listNegotiations(db, nextUser.id));
    setPayments(listPayments(db, nextUser.id));
    setPayoffSettings(getPayoffSettings(db, nextUser.id));
    setPayoffMilestones(listPayoffMilestones(db, nextUser.id));
    return nextUser;
  }

  async function handleLogin(input: LoginInput) {
    if (!db) throw new Error("GoXPlan is still starting. Please try again.");
    const nextUser = await loginUser(db, input);
    setSessionUserId(nextUser.id);
    setUser(nextUser);
    navigateToPage(getPageFromPath() ?? "dashboard", true);
    setStats(getDashboardStats(db, nextUser.id));
    setDebts(listDebts(db, nextUser.id));
    setFinancialAccounts(listFinancialAccounts(db, nextUser.id));
    setAccountMovements(listAccountMovements(db, nextUser.id));
    setIncome(listIncome(db, nextUser.id));
    setNegotiations(listNegotiations(db, nextUser.id));
    setPayments(listPayments(db, nextUser.id));
    setPayoffSettings(getPayoffSettings(db, nextUser.id));
    setPayoffMilestones(listPayoffMilestones(db, nextUser.id));
    return nextUser;
  }

  function handleLogout() {
    if (shouldConfirmDiscardPayoffChanges()) {
      openDiscardPayoffDialog(() => performLogout(), "Logout");
      return;
    }

    performLogout();
  }

  function performLogout() {
    clearSessionUserId();
    setUser(undefined);
    setPage("dashboard");
    setPayoffHasUnsavedChanges(false);
    setDebts([]);
    setFinancialAccounts([]);
    setAccountMovements([]);
    setIncome([]);
    setNegotiations([]);
    setPayments([]);
    setPayoffMilestones([]);
    setPayoffSettings(emptyPayoffSettings);
    setStats(emptyStats);
    window.history.replaceState(null, "", "/auth");
  }

  function navigateToPage(nextPage: AppPage, replace = false, skipPayoffConfirm = false) {
    if (page === nextPage) return true;
    if (!skipPayoffConfirm && shouldConfirmDiscardPayoffChanges(nextPage)) {
      openDiscardPayoffDialog(() => performNavigation(nextPage, replace));
      return false;
    }

    performNavigation(nextPage, replace);
    return true;
  }

  function performNavigation(nextPage: AppPage, replace = false) {
    setPage(nextPage);
    if (page === "payoff") setPayoffHasUnsavedChanges(false);
    if (replace) {
      replaceUrl(nextPage);
    } else {
      window.history.pushState(null, "", pagePaths[nextPage]);
    }
  }

  function openPayments(payment?: PaymentInput) {
    const openPaymentPage = () => {
      setPaymentDraft(payment);
      performNavigation("payments");
    };

    if (shouldConfirmDiscardPayoffChanges("payments")) {
      openDiscardPayoffDialog(openPaymentPage);
      return;
    }

    openPaymentPage();
  }

  function openPaymentFromNegotiation(negotiation: Negotiation) {
    if (!negotiation.debtId || negotiation.finalAgreementCents === null) return;
    openPayments({
      accountId: "",
      debtId: negotiation.debtId,
      paymentType: "SETTLEMENT",
      amount: centsToInput(negotiation.finalAgreementCents),
      principal: "",
      interestAndFees: "",
      resultingBalance: "",
      confirmationNumber: "",
      paymentMethod: "",
      paidDate: toDateInput(new Date().toISOString()),
      updateDebtStatus: true,
      notes: `Accepted negotiation agreement for ${negotiation.debtName ?? "this debt"}.`,
    });
  }

  async function handleSaveDebt(input: DebtInput) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    await upsertDebt(db, user.id, input);
    setDebts(listDebts(db, user.id));
    setStats(getDashboardStats(db, user.id));
  }

  async function handleDeleteDebt(debtId: string) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const debt = debts.find((item) => item.id === debtId);
    openConfirmDialog({
      confirmLabel: "Delete debt",
      message: `${debt?.creditorName ?? "This debt"} will be removed from your debt list. This cannot be undone.`,
      title: "Delete debt?",
      onConfirm: async () => {
        await deleteDebt(db, user.id, debtId);
        setDebts(listDebts(db, user.id));
        setStats(getDashboardStats(db, user.id));
      },
    });
  }

  async function handleImportKnownDebts() {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");

    await syncKnownDebts(db, user.id);

    setDebts(listDebts(db, user.id));
    setStats(getDashboardStats(db, user.id));
  }

  async function handleExportBackup(): Promise<GoXPlanBackup> {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    return exportUserBackup(db, user.id);
  }

  async function handleImportBackup(backup: unknown, mode: BackupImportMode): Promise<BackupImportSummary> {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const summary = await importUserBackup(db, user.id, backup, mode);
    refreshWorkspace(db, user.id);
    setPayoffHasUnsavedChanges(false);
    return summary;
  }

  async function handleSaveIncome(input: IncomeInput) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    await upsertIncome(db, user.id, input);
    setFinancialAccounts(listFinancialAccounts(db, user.id));
    setIncome(listIncome(db, user.id));
    setStats(getDashboardStats(db, user.id));
  }

  async function handleSaveNegotiation(input: NegotiationInput) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    await upsertNegotiation(db, user.id, input);
    setNegotiations(listNegotiations(db, user.id));
    setStats(getDashboardStats(db, user.id));
  }

  async function handleDeleteNegotiation(negotiationId: string) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const negotiation = negotiations.find((item) => item.id === negotiationId);
    openConfirmDialog({
      confirmLabel: "Delete negotiation",
      message: `${negotiation?.debtName ?? "This negotiation"} will be removed from your negotiation history.`,
      title: "Delete negotiation?",
      onConfirm: async () => {
        await deleteNegotiation(db, user.id, negotiationId);
        setNegotiations(listNegotiations(db, user.id));
        setStats(getDashboardStats(db, user.id));
      },
    });
  }

  async function handleDeleteIncome(incomeId: string) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const incomeRecord = income.find((item) => item.id === incomeId);
    openConfirmDialog({
      confirmLabel: "Delete income",
      message: `${incomeRecord?.source ?? "This income record"} will be removed. Any linked account balance or trading profit will be restored.`,
      title: "Delete income?",
      onConfirm: async () => {
        await deleteIncome(db, user.id, incomeId);
        setFinancialAccounts(listFinancialAccounts(db, user.id));
        setIncome(listIncome(db, user.id));
        setStats(getDashboardStats(db, user.id));
      },
    });
  }

  async function handleSaveFinancialAccount(input: FinancialAccountInput) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    await upsertFinancialAccount(db, user.id, input);
    setFinancialAccounts(listFinancialAccounts(db, user.id));
    setAccountMovements(listAccountMovements(db, user.id));
    setIncome(listIncome(db, user.id));
  }

  async function handleSaveAccountMovement(input: AccountMovementInput) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    await upsertAccountMovement(db, user.id, input);
    setFinancialAccounts(listFinancialAccounts(db, user.id));
    setAccountMovements(listAccountMovements(db, user.id));
  }

  async function handleDeleteFinancialAccount(accountId: string) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const account = financialAccounts.find((item) => item.id === accountId);
    openConfirmDialog({
      confirmLabel: "Delete account",
      message: `${account?.name ?? "This account"} will be removed. Income, payment, and cash movement history stay saved, but they will no longer be linked to this account.`,
      title: "Delete account?",
      onConfirm: async () => {
        await deleteFinancialAccount(db, user.id, accountId);
        setFinancialAccounts(listFinancialAccounts(db, user.id));
        setAccountMovements(listAccountMovements(db, user.id));
        setIncome(listIncome(db, user.id));
      },
    });
  }

  async function handleDeleteAccountMovement(movementId: string) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const movement = accountMovements.find((item) => item.id === movementId);
    openConfirmDialog({
      confirmLabel: "Delete movement",
      message: `${formatMovementName(movement)} will be removed and the affected account balances will be restored.`,
      title: "Delete movement?",
      onConfirm: async () => {
        await deleteAccountMovement(db, user.id, movementId);
        setFinancialAccounts(listFinancialAccounts(db, user.id));
        setAccountMovements(listAccountMovements(db, user.id));
      },
    });
  }

  async function handleSavePayment(input: PaymentInput) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const previousPayment = input.id ? payments.find((payment) => payment.id === input.id) : undefined;
    const savedPayment = await upsertPayment(db, user.id, input);
    const nextPayments = listPayments(db, user.id);
    const nextPayoffSettings = getPayoffSettings(db, user.id);
    await syncPayoffMilestoneFromRecords(db, user.id, nextPayoffSettings, nextPayments, savedPayment.paidAt);
    if (previousPayment?.paidAt && previousPayment.paidAt !== savedPayment.paidAt) {
      await syncPayoffMilestoneFromRecords(db, user.id, nextPayoffSettings, nextPayments, previousPayment.paidAt);
    }
    setDebts(listDebts(db, user.id));
    setFinancialAccounts(listFinancialAccounts(db, user.id));
    setPayments(nextPayments);
    setPayoffMilestones(listPayoffMilestones(db, user.id));
    setStats(getDashboardStats(db, user.id));
  }

  async function handleDeletePayment(paymentId: string) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const removedPayment = payments.find((payment) => payment.id === paymentId);
    await deletePayment(db, user.id, paymentId);
    const nextPayments = listPayments(db, user.id);
    const nextPayoffSettings = getPayoffSettings(db, user.id);
    await syncPayoffMilestoneFromRecords(db, user.id, nextPayoffSettings, nextPayments, removedPayment?.paidAt);
    setDebts(listDebts(db, user.id));
    setFinancialAccounts(listFinancialAccounts(db, user.id));
    setPayments(nextPayments);
    setPayoffMilestones(listPayoffMilestones(db, user.id));
    setStats(getDashboardStats(db, user.id));
  }

  async function handleSavePayoffSettings(input: PayoffSettingsInput) {
    if (!db || !user) throw new Error("GoXPlan is still starting. Please try again.");
    const nextPayoffSettings = await upsertPayoffSettings(db, user.id, input);
    const nextPayments = listPayments(db, user.id);
    await syncPayoffMilestoneFromRecords(db, user.id, nextPayoffSettings, nextPayments);
    setPayoffSettings(nextPayoffSettings);
    setPayoffMilestones(listPayoffMilestones(db, user.id));
  }

  const handlePayoffDirtyChange = useCallback((isDirty: boolean) => {
    setPayoffHasUnsavedChanges(isDirty);
  }, []);

  function shouldConfirmDiscardPayoffChanges(nextPage?: AppPage) {
    return page === "payoff" && payoffHasUnsavedChanges && nextPage !== "payoff";
  }

  function openDiscardPayoffDialog(action: () => void, confirmLabel = "Leave page") {
    openConfirmDialog({
      confirmLabel,
      message: "Your payoff plan has unsaved changes. Leaving now will keep the saved plan as-is and discard the current edits.",
      title: "Discard payoff changes?",
      tone: "neutral",
      onConfirm: async () => {
        setPayoffHasUnsavedChanges(false);
        action();
      },
    });
  }

  function openConfirmDialog(dialog: ConfirmDialogState) {
    setConfirmDialog(dialog);
  }

  function refreshWorkspace(database: Database, userId: string) {
    setStats(getDashboardStats(database, userId));
    setDebts(listDebts(database, userId));
    setFinancialAccounts(listFinancialAccounts(database, userId));
    setAccountMovements(listAccountMovements(database, userId));
    setIncome(listIncome(database, userId));
    setNegotiations(listNegotiations(database, userId));
    setPayments(listPayments(database, userId));
    setPayoffMilestones(listPayoffMilestones(database, userId));
    setPayoffSettings(getPayoffSettings(database, userId));
  }

  async function confirmDialogAction() {
    if (!confirmDialog) return;
    setIsConfirming(true);

    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(undefined);
    } finally {
      setIsConfirming(false);
    }
  }

  if (isLoading) {
    return (
      <main className="center-screen">
        <section className="loading-card">
          <strong>GoXPlan</strong>
          <span>Opening GoXPlan...</span>
        </section>
      </main>
    );
  }

  if (startupError) {
    return (
      <main className="center-screen">
        <section className="loading-card">
          <strong>GoXPlan</strong>
          <span>{startupError}</span>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthPage
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    );
  }

  return (
    <>
      <AppShell
      activePage={page}
      stats={stats}
      theme={theme}
      user={user}
      onLogout={handleLogout}
      onNavigate={navigateToPage}
      onToggleTheme={toggleTheme}
    >
      {page === "debts" ? (
        <DebtsPage
          debts={debts}
          negotiations={negotiations}
          payments={payments}
          onImportKnownDebts={handleImportKnownDebts}
          onSave={handleSaveDebt}
          onDelete={handleDeleteDebt}
        />
      ) : page === "accounts" ? (
        <AccountsPage
          accounts={financialAccounts}
          accountMovements={accountMovements}
          income={income}
          payments={payments}
          onSaveMovement={handleSaveAccountMovement}
          onDeleteMovement={handleDeleteAccountMovement}
          onSave={handleSaveFinancialAccount}
          onDelete={handleDeleteFinancialAccount}
        />
      ) : page === "income" ? (
        <IncomePage
          financialAccounts={financialAccounts}
          income={income}
          onSave={handleSaveIncome}
          onDelete={handleDeleteIncome}
        />
      ) : page === "payments" ? (
        <PaymentsPage
          debts={debts}
          financialAccounts={financialAccounts}
          initialPayment={paymentDraft}
          negotiations={negotiations}
          payments={payments}
          payoffSettings={payoffSettings}
          onSave={handleSavePayment}
          onDelete={handleDeletePayment}
          onInitialPaymentUsed={() => setPaymentDraft(undefined)}
        />
      ) : page === "negotiations" ? (
        <NegotiationsPage
          debts={debts}
          negotiations={negotiations}
          onSave={handleSaveNegotiation}
          onDelete={handleDeleteNegotiation}
          onUseForPayoff={openPaymentFromNegotiation}
        />
      ) : page === "reports" ? (
        <ReportsPage
          accountMovements={accountMovements}
          accounts={financialAccounts}
          debts={debts}
          income={income}
          negotiations={negotiations}
          payments={payments}
          onOpenIncome={() => navigateToPage("income")}
          onOpenPayments={() => openPayments()}
        />
      ) : page === "payoff" ? (
        <PayoffPlanPage
          accountMovements={accountMovements}
          debts={debts}
          financialAccounts={financialAccounts}
          income={income}
          negotiations={negotiations}
          payoffMilestones={payoffMilestones}
          payments={payments}
          settings={payoffSettings}
          onOpenDebts={() => navigateToPage("debts")}
          onOpenIncome={() => navigateToPage("income")}
          onOpenPayments={openPayments}
          onDirtyChange={handlePayoffDirtyChange}
          onSaveSettings={handleSavePayoffSettings}
        />
      ) : page === "backup" ? (
        <BackupPage
          accountMovements={accountMovements}
          accounts={financialAccounts}
          counts={{
            accounts: financialAccounts.length,
            accountMovements: accountMovements.length,
            debts: debts.length,
            income: income.length,
            negotiations: negotiations.length,
            payments: payments.length,
            payoffMilestones: payoffMilestones.length,
            payoffSettings: payoffSettings.userId ? 1 : 0,
          }}
          debts={debts}
          income={income}
          negotiations={negotiations}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          payments={payments}
        />
      ) : (
        <DashboardPage
          accountMovements={accountMovements}
          accounts={financialAccounts}
          debts={debts}
          income={income}
          negotiations={negotiations}
          payoffMilestones={payoffMilestones}
          payoffSettings={payoffSettings}
          payments={payments}
          user={user}
          stats={stats}
          onOpenDebts={() => navigateToPage("debts")}
          onOpenNegotiations={() => navigateToPage("negotiations")}
        />
      )}
      </AppShell>

      {confirmDialog && (
        <ConfirmDialog
          confirmLabel={confirmDialog.confirmLabel}
          isBusy={isConfirming}
          message={confirmDialog.message}
          tone={confirmDialog.tone}
          title={confirmDialog.title}
          onCancel={() => setConfirmDialog(undefined)}
          onConfirm={() => void confirmDialogAction()}
        />
      )}
    </>
  );
}

function getPageFromPath(): AppPage | undefined {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/dashboard") return "dashboard";
  if (path === "/debts") return "debts";
  if (path === "/accounts") return "accounts";
  if (path === "/income") return "income";
  if (path === "/negotiations") return "negotiations";
  if (path === "/payments") return "payments";
  if (path === "/reports") return "reports";
  if (path === "/payoff") return "payoff";
  if (path === "/backup") return "backup";
  return undefined;
}

function replaceUrl(page: AppPage) {
  window.history.replaceState(null, "", pagePaths[page]);
}

async function syncKnownDebts(db: Database, userId: string) {
  const existingDebts = listDebts(db, userId);

  for (const [index, debt] of knownDebts.entries()) {
    const stableId = `${userId}:known-debt:${index + 1}`;
    const legacyMatch = existingDebts.find((existingDebt) => getKnownDebtIndex(existingDebt, userId) === index);
    if (legacyMatch) continue;

    await upsertDebt(db, userId, {
      ...debt,
      id: stableId,
    });
  }
}

function normalizeCreditorName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function formatMovementName(movement: AccountMovement | undefined) {
  if (!movement) return "This account movement";
  if (movement.movementType === "TRANSFER") {
    return `Transfer from ${movement.fromAccountName ?? "one account"} to ${movement.toAccountName ?? "another account"}`;
  }
  return `Balance adjustment for ${movement.toAccountName ?? movement.fromAccountName ?? "this account"}`;
}

function toDateInput(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function getKnownDebtIndex(debt: Debt, userId: string) {
  const stablePrefix = `${userId}:known-debt:`;
  if (debt.id.startsWith(stablePrefix)) {
    const index = Number(debt.id.slice(stablePrefix.length)) - 1;
    if (Number.isInteger(index) && index >= 0 && index < knownDebts.length) return index;
  }

  return legacyCreditorNames.findIndex((names, index) => {
    if (debt.priority !== knownDebts[index].priority) return false;
    return names.includes(normalizeCreditorName(debt.creditorName));
  });
}

const legacyCreditorNames = knownDebts.map((debt) => [normalizeCreditorName(debt.creditorName)]);

legacyCreditorNames[1].push(normalizeCreditorName("Spring Oak"));
legacyCreditorNames[2].push(normalizeCreditorName("National C"));
legacyCreditorNames[8].push(normalizeCreditorName("Upstart / Loan"));
legacyCreditorNames[9].push(normalizeCreditorName("Samsung"));
legacyCreditorNames[10].push(normalizeCreditorName("Amazon Purchase"));
legacyCreditorNames[12].push(normalizeCreditorName("Sezzle / Trellis"));
