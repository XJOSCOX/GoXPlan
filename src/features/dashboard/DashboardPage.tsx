import { ArrowRight, CalendarClock, CircleAlert, FileCheck2, Flag, Handshake, PiggyBank, TrendingDown, WalletCards } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { getDebtPriorityLevel, priorityLevelRanges } from "../../lib/debtPriority";
import { buildFinancialSummary, getDebtObligationCents } from "../../lib/financialSummary";
import { buildPayoffPeriodProgress, formatPayoffPeriodRange } from "../../lib/payoffPeriods";
import type {
  AccountMovement,
  DashboardStats,
  Debt,
  DebtSnapshot,
  FinancialAccount,
  Income,
  Negotiation,
  Payment,
  PayoffMilestone,
  PayoffSettings,
  PublicUser,
} from "../../types";

type DashboardPageProps = {
  accountMovements: AccountMovement[];
  accounts: FinancialAccount[];
  debts: Debt[];
  debtSnapshots: DebtSnapshot[];
  income: Income[];
  negotiations: Negotiation[];
  payoffMilestones: PayoffMilestone[];
  payoffSettings: PayoffSettings;
  payments: Payment[];
  user: PublicUser;
  stats: DashboardStats;
  onOpenDebts: () => void;
  onOpenNegotiations: () => void;
};

const emergencyPageSize = 4;

export function DashboardPage({
  accountMovements,
  accounts,
  debts,
  debtSnapshots,
  income,
  negotiations,
  payoffMilestones,
  payoffSettings,
  payments,
  user,
  stats,
  onOpenDebts,
  onOpenNegotiations,
}: DashboardPageProps) {
  const [emergencyPage, setEmergencyPage] = useState(1);
  const financialSummary = buildFinancialSummary({ accountMovements, accounts, debts, income, negotiations, payments });
  const paymentSummary = financialSummary.paymentSummary;
  const negotiationInsights = financialSummary.negotiationInsights;
  const totalPaid = financialSummary.totalPrincipalPaidCents;
  const remainingBalance = financialSummary.fullRemainingBalanceCents;
  const obligationAmount = financialSummary.currentObligationsCents;
  const potentialSavings = financialSummary.possibleSettlementSavingsCents;
  const reportedCount = financialSummary.reportedDebtCount;
  const obligationProgressBase = totalPaid + obligationAmount;
  const paidPercent = obligationProgressBase ? Math.min(100, Math.round((totalPaid / obligationProgressBase) * 100)) : 0;
  const topDebt = getTopDebt(debts);
  const currentPayoffPeriod = useMemo(
    () =>
      payoffSettings.monthlyBudgetCents > 0
        ? buildPayoffPeriodProgress(payoffSettings.budgetFrequency, payoffSettings.monthlyBudgetCents, payments)
        : undefined,
    [payments, payoffSettings.budgetFrequency, payoffSettings.monthlyBudgetCents],
  );
  const periodTrendRows = useMemo(
    () => buildPeriodTrendRows(payoffMilestones, payments, payoffSettings),
    [payments, payoffMilestones, payoffSettings.budgetFrequency, payoffSettings.monthlyBudgetCents],
  );
  const balanceTrendRows = useMemo(() => buildBalanceTrendRows(debts, debtSnapshots), [debts, debtSnapshots]);
  const negotiationAlerts = buildNegotiationAlerts(negotiations, debts);
  const collectionCount = financialSummary.collectionDebtCount;
  const pastDueCount = financialSummary.pastDueDebtCount;
  const emergencyDebts = debts
    .filter((debt) => getDebtPriorityLevel(debt.priorityScore) === "Emergency" && getDebtObligationCents(debt, paymentSummary, negotiationInsights.get(debt.id)) > 0)
    .sort((left, right) => left.priority - right.priority || right.priorityScore - left.priorityScore);
  const emergencyPages = Math.max(1, Math.ceil(emergencyDebts.length / emergencyPageSize));
  const activeEmergencyPage = Math.min(emergencyPage, emergencyPages);
  const visibleEmergencyDebts = emergencyDebts.slice((activeEmergencyPage - 1) * emergencyPageSize, activeEmergencyPage * emergencyPageSize);
  const levelRows = priorityLevelRanges
    .map((range) => {
      const exposure = financialSummary.priorityExposureRows.find((row) => row.level === range.level);
      const balance = exposure?.amountCents ?? 0;
      const percent = obligationAmount ? Math.round((balance / obligationAmount) * 100) : 0;
      return { ...range, balance, count: exposure?.count ?? 0, percent };
    })
    .filter((row) => row.count > 0);
  const urgencyRows = levelRows.filter((row) => row.level !== "Emergency");

  return (
    <div className="page-stack dashboard-page">
      <section className="finance-overview-grid">
        <article className="finance-balance-panel">
          <div className="finance-panel-label">
            <WalletCards size={18} />
            <span>Current obligations</span>
          </div>
          <h2>{formatCurrency(obligationAmount)}</h2>
          <p>
            Full debt balance is {formatCurrency(remainingBalance)}. This view shows what needs action now.
          </p>

          <div className="finance-progress-track" aria-label={`${paidPercent}% paid`}>
            <span style={{ width: `${paidPercent}%` }} />
          </div>

          <div className="finance-balance-foot">
            <span>{paidPercent}% paid</span>
            <span>{stats.debts} debts tracked</span>
          </div>
        </article>

        <article className="finance-next-panel">
          <div className="finance-panel-label panel-label-with-actions">
            <span>
              <Flag size={18} />
              {emergencyDebts.length ? "Emergency focus" : "Next priority"}
            </span>
            {emergencyPages > 1 && (
              <span className="emergency-pager">
                <button
                  type="button"
                  disabled={activeEmergencyPage === 1}
                  onClick={() => setEmergencyPage((page) => Math.max(1, page - 1))}
                  aria-label="Previous emergency debts"
                >
                  &lt;
                </button>
                <em>{activeEmergencyPage}/{emergencyPages}</em>
                <button
                  type="button"
                  disabled={activeEmergencyPage === emergencyPages}
                  onClick={() => setEmergencyPage((page) => Math.min(emergencyPages, page + 1))}
                  aria-label="Next emergency debts"
                >
                  &gt;
                </button>
              </span>
            )}
          </div>
          {emergencyDebts.length ? (
            <>
              <p>
                {emergencyDebts.length === 1
                  ? emergencyDebts[0].reason || "This account needs first attention."
                  : `${emergencyDebts.length} accounts need your attention.`}
              </p>
              <div className="emergency-focus-list">
                {visibleEmergencyDebts.map((debt) => (
                  <div key={debt.id}>
                    <span className="emergency-account-name">
                      <span>{debt.creditorName}</span>
                      <span
                        aria-label={getEmergencyNote(debt)}
                        className="note-tooltip emergency-note-tooltip"
                        data-tooltip={getEmergencyNote(debt)}
                        tabIndex={0}
                        title={getEmergencyNote(debt)}
                      >
                        !
                      </span>
                    </span>
                    <strong>{formatCurrency(getDebtObligationCents(debt, paymentSummary, negotiationInsights.get(debt.id)))}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2>{topDebt?.creditorName ?? "Start your plan"}</h2>
              <p>{topDebt ? topDebt.reason || "Review this account first." : `Welcome, ${user.firstName}. Add debts to activate the dashboard.`}</p>
              {topDebt && <strong>{formatCurrency(getDebtObligationCents(topDebt, paymentSummary, negotiationInsights.get(topDebt.id)))}</strong>}
              <button className="primary-button compact good-entry" type="button" onClick={onOpenDebts}>
                Open debts
                <ArrowRight size={17} />
              </button>
            </>
          )}
        </article>

        <article className="finance-urgency-panel">
          <div className="finance-panel-label">
            <CircleAlert size={18} />
            <span>Obligations by urgency</span>
          </div>

          <div className="priority-exposure-compact">
            {urgencyRows.map((row) => (
              <div className={`priority-compact-row priority-${row.level.toLowerCase()}`} key={row.level}>
                <div>
                  <span>{row.level}</span>
                  <em>{row.count} debt{row.count === 1 ? "" : "s"}</em>
                </div>
                <strong>{formatCurrency(row.balance)}</strong>
                <div className="priority-exposure-meter" aria-label={`${row.level} ${row.percent}%`}>
                  <span style={{ width: `${Math.max(row.percent, 4)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="finance-simple-metrics">
        <article>
          <PiggyBank size={17} />
          <span>Total debt balance</span>
          <strong>{formatCurrency(remainingBalance)}</strong>
        </article>
        <article>
          <TrendingDown size={17} />
          <span>Possible savings</span>
          <strong>{formatCurrency(potentialSavings)}</strong>
        </article>
        <article>
          <CircleAlert size={17} />
          <span>Reported debts</span>
          <strong>
            {reportedCount}/{stats.debts}
          </strong>
        </article>
        <article>
          <CalendarClock size={17} />
          <span>Needs attention</span>
          <strong>{collectionCount + pastDueCount}</strong>
        </article>
      </section>

      <section className="finance-chart-grid">
        <article className="panel payoff-progress-panel">
          <div className="finance-section-heading">
            <div>
              <h2>Paid vs obligations</h2>
            </div>
          </div>

          <div className="payoff-progress-body">
            <div
              className="finance-progress-ring"
              style={{ "--progress": `${paidPercent * 3.6}deg` } as CSSProperties}
              aria-label={`${paidPercent}% paid`}
            >
              <strong>{paidPercent}%</strong>
              <span>paid</span>
            </div>

            <div className="payoff-progress-details">
              <div>
                <span>Principal paid</span>
                <strong>{formatCurrency(totalPaid)}</strong>
              </div>
              <div>
                <span>Fees recorded</span>
                <strong>{formatCurrency(paymentSummary.totalFeesCents)}</strong>
              </div>
              <div>
                <span>Current obligations</span>
                <strong>{formatCurrency(obligationAmount)}</strong>
              </div>
              <div>
                <span>Full balance</span>
                <strong>{formatCurrency(remainingBalance)}</strong>
              </div>
            </div>
          </div>
        </article>

        <article className="panel negotiation-watch-panel">
          <div className="finance-section-heading">
            <div>
              <h2>Negotiation watch</h2>
            </div>
            <span>{stats.negotiations} total</span>
          </div>

          {negotiationAlerts.length ? (
            <div className="negotiation-watch-list">
              {negotiationAlerts.slice(0, 4).map((alert) => (
                <div className={`negotiation-watch-item ${alert.tone}`} key={alert.id}>
                  <span className="negotiation-watch-icon">
                    {alert.kind === "Agreement" ? <FileCheck2 size={15} /> : <Handshake size={15} />}
                  </span>
                  <div>
                    <strong>{alert.debtName}</strong>
                    <span>
                      {alert.kind}
                      {alert.dateLabel ? ` - ${alert.dateLabel}` : ""}
                    </span>
                  </div>
                  <em>{formatCurrency(alert.amountCents)}</em>
                </div>
              ))}
            </div>
          ) : (
            <div className="negotiation-watch-empty">
              <strong>{negotiations.length ? "No urgent negotiation dates." : "No negotiations yet."}</strong>
              <span>{negotiations.length ? "Follow-ups and expiring offers will appear here." : "Record offers, follow-ups, and agreements as calls happen."}</span>
            </div>
          )}

          <button className="primary-button compact good-entry" type="button" onClick={onOpenNegotiations}>
            Open negotiations
            <ArrowRight size={17} />
          </button>
        </article>

        <article className="panel monthly-payments-panel">
          <div className="finance-section-heading">
            <div>
              <h2>{balanceTrendRows.length ? "Balance history" : "Payoff period trend"}</h2>
            </div>
            <span>{balanceTrendRows.length ? "Snapshots" : formatBudgetFrequency(payoffSettings.budgetFrequency)}</span>
          </div>

          {balanceTrendRows.length ? (
            <>
              <div className="period-trend-chart" aria-label="Debt balance history chart">
                {balanceTrendRows.map((row) => (
                  <div className="period-trend-column" key={row.key} title={`${row.label}: ${formatCurrency(row.balanceCents)}`}>
                    <div className="period-trend-bar-shell">
                      <span className="period-trend-bar active" style={{ height: `${Math.max(8, row.percent)}%` }}>
                        <em>{formatCompactCurrency(row.balanceCents)}</em>
                      </span>
                    </div>
                    <strong>{row.label}</strong>
                    <small>{row.count} point{row.count === 1 ? "" : "s"}</small>
                  </div>
                ))}
              </div>
              <div className="period-trend-summary">
                <span>
                  Latest <strong>{formatCurrency(balanceTrendRows[balanceTrendRows.length - 1]?.balanceCents ?? remainingBalance)}</strong>
                </span>
                <span>
                  Points <strong>{debtSnapshots.length}</strong>
                </span>
                <span>
                  Debts <strong>{stats.debts}</strong>
                </span>
              </div>
            </>
          ) : periodTrendRows.length ? (
            <>
              <div className="period-trend-chart" aria-label="Payoff period goal progress chart">
                {periodTrendRows.map((row) => (
                  <div className="period-trend-column" key={row.key} title={`${row.range}: ${formatCurrency(row.paidCents)} of ${formatCurrency(row.targetCents)}`}>
                    <div className="period-trend-bar-shell">
                      <span className={`period-trend-bar ${row.status.toLowerCase()}`} style={{ height: `${row.paidCents ? Math.max(8, row.paidPercent) : 3}%` }}>
                        {row.paidCents > 0 && <em>{row.paidPercent}%</em>}
                      </span>
                    </div>
                    <strong>{row.label}</strong>
                    <small>{row.status === "DONE" ? "Met" : row.status === "SHORT" ? "Short" : "Active"}</small>
                  </div>
                ))}
              </div>
              <div className="period-trend-summary">
                <span>
                  Current goal <strong>{formatCurrency(currentPayoffPeriod?.targetCents ?? 0)}</strong>
                </span>
                <span>
                  Paid now <strong>{formatCurrency(currentPayoffPeriod?.paidCents ?? 0)}</strong>
                </span>
                <span>
                  Left <strong>{formatCurrency(currentPayoffPeriod?.remainingCents ?? 0)}</strong>
                </span>
              </div>
            </>
          ) : (
            <div className="period-trend-empty">
              <strong>No payoff budget yet.</strong>
              <span>Set a weekly, monthly, or yearly budget on the payoff plan to start tracking milestones.</span>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

type PeriodTrendRow = {
  key: string;
  label: string;
  paidCents: number;
  paidPercent: number;
  range: string;
  status: "ACTIVE" | "DONE" | "SHORT";
  targetCents: number;
};

type BalanceTrendRow = {
  balanceCents: number;
  count: number;
  key: string;
  label: string;
  percent: number;
};

function buildBalanceTrendRows(debts: Debt[], snapshots: DebtSnapshot[]): BalanceTrendRow[] {
  const usableSnapshots = snapshots
    .filter((snapshot) => snapshot.debtId && debts.some((debt) => debt.id === snapshot.debtId))
    .sort((left, right) => left.snapshotAt.localeCompare(right.snapshotAt) || left.createdAt.localeCompare(right.createdAt));
  if (!usableSnapshots.length) return [];

  const balancesByDebt = new Map(debts.map((debt) => [debt.id, debt.balanceCents]));
  const rowsByDay = new Map<string, { balanceCents: number; count: number }>();

  for (const snapshot of usableSnapshots) {
    if (!snapshot.debtId) continue;
    balancesByDebt.set(snapshot.debtId, Math.max(0, snapshot.balanceCents));
    const key = snapshot.snapshotAt.slice(0, 10);
    rowsByDay.set(key, {
      balanceCents: [...balancesByDebt.values()].reduce((sum, cents) => sum + cents, 0),
      count: (rowsByDay.get(key)?.count ?? 0) + 1,
    });
  }

  const rows = [...rowsByDay.entries()].slice(-6);
  const maxBalance = Math.max(...rows.map(([, row]) => row.balanceCents), 1);

  return rows.map(([key, row]) => ({
    balanceCents: row.balanceCents,
    count: row.count,
    key,
    label: formatShortDate(key),
    percent: Math.round((row.balanceCents / maxBalance) * 100),
  }));
}

function buildPeriodTrendRows(milestones: PayoffMilestone[], payments: Payment[], settings: PayoffSettings): PeriodTrendRow[] {
  if (settings.monthlyBudgetCents <= 0) return [];

  const current = buildPayoffPeriodProgress(settings.budgetFrequency, settings.monthlyBudgetCents, payments);
  const rows = new Map<string, PeriodTrendRow>();
  const today = new Date().toISOString().slice(0, 10);

  for (const milestone of milestones) {
    if (milestone.budgetFrequency !== settings.budgetFrequency || milestone.targetCents <= 0) continue;
    const key = getPeriodKey(milestone.budgetFrequency, milestone.periodStart, milestone.periodEnd);
    const paidPercent = milestone.targetCents > 0 ? Math.min(100, Math.round((milestone.paidCents / milestone.targetCents) * 100)) : 0;
    rows.set(key, {
      key,
      label: formatPeriodLabel(milestone.periodStart, settings.budgetFrequency),
      paidCents: milestone.paidCents,
      paidPercent,
      range: formatPayoffPeriodRange(milestone.periodStart, milestone.periodEnd),
      status: milestone.status === "DONE" ? "DONE" : milestone.periodEnd < today ? "SHORT" : "ACTIVE",
      targetCents: milestone.targetCents,
    });
  }

  const currentKey = getPeriodKey(settings.budgetFrequency, current.periodStart, current.periodEnd);
  rows.set(currentKey, {
    key: currentKey,
    label: formatPeriodLabel(current.periodStart, settings.budgetFrequency),
    paidCents: current.paidCents,
    paidPercent: current.paidPercent,
    range: formatPayoffPeriodRange(current.periodStart, current.periodEnd),
    status: current.isDone ? "DONE" : "ACTIVE",
    targetCents: current.targetCents,
  });

  return [...rows.values()].sort((left, right) => left.key.localeCompare(right.key)).slice(-6);
}

function getPeriodKey(frequency: PayoffSettings["budgetFrequency"], periodStart: string, periodEnd: string) {
  return `${frequency}:${periodStart}:${periodEnd}`;
}

function formatPeriodLabel(periodStart: string, frequency: PayoffSettings["budgetFrequency"]) {
  const date = new Date(`${periodStart}T12:00:00.000Z`);
  if (frequency === "YEARLY") return String(date.getUTCFullYear());
  if (frequency === "MONTHLY") return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function formatBudgetFrequency(frequency: PayoffSettings["budgetFrequency"]) {
  if (frequency === "WEEKLY") return "Weekly goal";
  if (frequency === "YEARLY") return "Yearly goal";
  return "Monthly goal";
}

type NegotiationAlert = {
  amountCents: number;
  dateLabel: string;
  debtName: string;
  id: string;
  kind: "Agreement" | "Expires" | "Follow-up" | "Overdue";
  sortDate: number;
  tone: "danger" | "neutral" | "success" | "warning";
};

function getTopDebt(debts: Debt[]) {
  return debts.reduce<Debt | undefined>((highest, debt) => {
    if (!highest) return debt;
    if (debt.priorityScore > highest.priorityScore) return debt;
    if (debt.priorityScore === highest.priorityScore && debt.priority < highest.priority) return debt;
    return highest;
  }, undefined);
}

function getEmergencyNote(debt: Debt) {
  const note = [debt.reason, debt.notes].filter(Boolean).join(" | ");
  return note || "No notes yet.";
}

function buildNegotiationAlerts(negotiations: Negotiation[], debts: Debt[]): NegotiationAlert[] {
  const debtNames = new Map(debts.map((debt) => [debt.id, debt.creditorName]));
  const alerts: NegotiationAlert[] = [];

  for (const negotiation of negotiations) {
    const debtName = negotiation.debtName ?? (negotiation.debtId ? debtNames.get(negotiation.debtId) : undefined) ?? "Removed debt";
    const amountCents = getNegotiationAmount(negotiation);

    if (negotiation.followUpAt) {
      alerts.push({
        amountCents,
        dateLabel: formatShortDate(negotiation.followUpAt),
        debtName,
        id: `${negotiation.id}:follow-up`,
        kind: isPast(negotiation.followUpAt) ? "Overdue" : "Follow-up",
        sortDate: new Date(negotiation.followUpAt).getTime(),
        tone: isPast(negotiation.followUpAt) ? "danger" : "warning",
      });
    }

    if (negotiation.offerExpiresAt && isWithinDays(negotiation.offerExpiresAt, 14)) {
      alerts.push({
        amountCents,
        dateLabel: formatShortDate(negotiation.offerExpiresAt),
        debtName,
        id: `${negotiation.id}:expires`,
        kind: "Expires",
        sortDate: new Date(negotiation.offerExpiresAt).getTime(),
        tone: "warning",
      });
    }

    if (negotiation.status === "ACCEPTED" && negotiation.finalAgreementCents !== null) {
      alerts.push({
        amountCents: negotiation.finalAgreementCents,
        dateLabel: negotiation.dueDate ? formatShortDate(negotiation.dueDate) : "",
        debtName,
        id: `${negotiation.id}:agreement`,
        kind: "Agreement",
        sortDate: negotiation.dueDate ? new Date(negotiation.dueDate).getTime() : Number.MAX_SAFE_INTEGER,
        tone: "success",
      });
    }
  }

  return alerts.sort((left, right) => {
    const tonePriority = getAlertTonePriority(left.tone) - getAlertTonePriority(right.tone);
    return tonePriority || left.sortDate - right.sortDate || left.debtName.localeCompare(right.debtName);
  });
}

function getNegotiationAmount(negotiation: Negotiation) {
  return negotiation.finalAgreementCents ?? negotiation.counterOfferCents ?? negotiation.userOfferCents ?? negotiation.currentOfferCents ?? negotiation.balanceCents ?? 0;
}

function getAlertTonePriority(tone: NegotiationAlert["tone"]) {
  if (tone === "danger") return 0;
  if (tone === "warning") return 1;
  if (tone === "success") return 2;
  return 3;
}

function isPast(value: string) {
  return new Date(`${value.slice(0, 10)}T23:59:59`).getTime() < Date.now();
}

function isWithinDays(value: string, days: number) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  const difference = time - Date.now();
  return difference >= 0 && difference <= days * 24 * 60 * 60 * 1000;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function formatCompactCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { compactDisplay: "short", currency: "USD", maximumFractionDigits: 1, notation: "compact", style: "currency" }).format(cents / 100);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(new Date(value));
}
