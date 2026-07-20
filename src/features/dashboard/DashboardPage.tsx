import { ArrowRight, CalendarClock, CircleAlert, FileCheck2, Flag, Handshake, PiggyBank, TrendingDown, WalletCards } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { getDebtPriorityLevel, priorityLevelRanges } from "../../lib/debtPriority";
import { buildNegotiationInsights, getPlanningTarget, type DebtNegotiationInsight } from "../../lib/negotiationTargets";
import type { DashboardStats, Debt, Negotiation, Payment, PublicUser } from "../../types";

type DashboardPageProps = {
  debts: Debt[];
  negotiations: Negotiation[];
  payments: Payment[];
  user: PublicUser;
  stats: DashboardStats;
  onOpenDebts: () => void;
  onOpenNegotiations: () => void;
};

const emergencyPageSize = 4;

export function DashboardPage({ debts, negotiations, payments, user, stats, onOpenDebts, onOpenNegotiations }: DashboardPageProps) {
  const [emergencyPage, setEmergencyPage] = useState(1);
  const paymentSummary = summarizePayments(payments);
  const negotiationInsights = buildNegotiationInsights(negotiations);
  const totalPaid = [...paymentSummary.paidByDebt.values()].reduce((sum, amount) => sum + amount, 0);
  const remainingBalance = debts.reduce((sum, debt) => sum + getRemainingCents(debt, paymentSummary), 0);
  const obligationAmount = debts.reduce((sum, debt) => sum + getObligationCents(debt, paymentSummary, negotiationInsights.get(debt.id)), 0);
  const potentialSavings = debts.reduce((sum, debt) => sum + getSettlementSavingsCents(debt, negotiationInsights.get(debt.id)), 0);
  const reportedCount = debts.filter((debt) => debt.reported).length;
  const obligationProgressBase = totalPaid + obligationAmount;
  const paidPercent = obligationProgressBase ? Math.min(100, Math.round((totalPaid / obligationProgressBase) * 100)) : 0;
  const topDebt = getTopDebt(debts);
  const monthlyPaymentRows = buildMonthlyPaymentRows(payments);
  const maxMonthlyPayment = Math.max(...monthlyPaymentRows.map((row) => row.amount), 1);
  const negotiationAlerts = buildNegotiationAlerts(negotiations, debts);
  const collectionCount = debts.filter((debt) => debt.status === "COLLECTION").length;
  const pastDueCount = debts.filter((debt) => debt.status === "PAST_DUE").length;
  const emergencyDebts = debts
    .filter((debt) => getDebtPriorityLevel(debt.priorityScore) === "Emergency" && getObligationCents(debt, paymentSummary, negotiationInsights.get(debt.id)) > 0)
    .sort((left, right) => left.priority - right.priority || right.priorityScore - left.priorityScore);
  const emergencyPages = Math.max(1, Math.ceil(emergencyDebts.length / emergencyPageSize));
  const activeEmergencyPage = Math.min(emergencyPage, emergencyPages);
  const visibleEmergencyDebts = emergencyDebts.slice((activeEmergencyPage - 1) * emergencyPageSize, activeEmergencyPage * emergencyPageSize);
  const levelRows = priorityLevelRanges
    .map((range) => {
      const levelDebts = debts.filter((debt) => getDebtPriorityLevel(debt.priorityScore) === range.level);
      const balance = levelDebts.reduce((sum, debt) => sum + getObligationCents(debt, paymentSummary, negotiationInsights.get(debt.id)), 0);
      const percent = obligationAmount ? Math.round((balance / obligationAmount) * 100) : 0;
      return { ...range, balance, count: levelDebts.length, percent };
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
                    <strong>{formatCurrency(getObligationCents(debt, paymentSummary, negotiationInsights.get(debt.id)))}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2>{topDebt?.creditorName ?? "Start your plan"}</h2>
              <p>{topDebt ? topDebt.reason || "Review this account first." : `Welcome, ${user.firstName}. Add debts to activate the dashboard.`}</p>
              {topDebt && <strong>{formatCurrency(getObligationCents(topDebt, paymentSummary, negotiationInsights.get(topDebt.id)))}</strong>}
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
                <span>Paid</span>
                <strong>{formatCurrency(totalPaid)}</strong>
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

        <article className="panel projection-placeholder-panel">
          <div className="finance-section-heading">
            <div>
              <h2>Monthly payments</h2>
            </div>
            <span>Last 6 months</span>
          </div>

          <div className="monthly-payment-chart" aria-label="Monthly payment history chart">
            {monthlyPaymentRows.map((row) => (
              <div className="monthly-payment-column" key={row.key}>
                <span className="monthly-payment-bar" style={{ height: `${row.amount ? Math.max(8, (row.amount / maxMonthlyPayment) * 100) : 3}%` }}>
                  {row.amount > 0 && <em>{formatCompactCurrency(row.amount)}</em>}
                </span>
                <strong>{row.label}</strong>
              </div>
            ))}
          </div>
          <p className="placeholder-note">
            {payments.length ? "Payments recorded by month." : "Record payments to activate the monthly chart."}
          </p>
        </article>
      </section>
    </div>
  );
}

type MonthlyPaymentRow = {
  amount: number;
  key: string;
  label: string;
};

type NegotiationAlert = {
  amountCents: number;
  dateLabel: string;
  debtName: string;
  id: string;
  kind: "Agreement" | "Expires" | "Follow-up" | "Overdue";
  sortDate: number;
  tone: "danger" | "neutral" | "success" | "warning";
};

function summarizePayments(payments: Payment[]) {
  const paidByDebt = new Map<string, number>();
  const resultingBalanceByDebt = new Map<string, { paidAt: string; amount: number }>();

  for (const payment of payments) {
    if (!payment.debtId) continue;
    const paidAmount = payment.principalCents ?? payment.amountCents;
    paidByDebt.set(payment.debtId, (paidByDebt.get(payment.debtId) ?? 0) + paidAmount);

    if (payment.resultingBalanceCents !== null) {
      const current = resultingBalanceByDebt.get(payment.debtId);
      if (!current || payment.paidAt > current.paidAt) {
        resultingBalanceByDebt.set(payment.debtId, { paidAt: payment.paidAt, amount: payment.resultingBalanceCents });
      }
    }
  }

  return { paidByDebt, resultingBalanceByDebt };
}

function getTopDebt(debts: Debt[]) {
  return debts.reduce<Debt | undefined>((highest, debt) => {
    if (!highest) return debt;
    if (debt.priorityScore > highest.priorityScore) return debt;
    if (debt.priorityScore === highest.priorityScore && debt.priority < highest.priority) return debt;
    return highest;
  }, undefined);
}

function getRemainingCents(debt: Debt, summary: ReturnType<typeof summarizePayments>) {
  return summary.resultingBalanceByDebt.get(debt.id)?.amount ?? Math.max(0, debt.balanceCents - (summary.paidByDebt.get(debt.id) ?? 0));
}

function getObligationCents(debt: Debt, summary: ReturnType<typeof summarizePayments>, insight?: DebtNegotiationInsight) {
  const remaining = getRemainingCents(debt, summary);
  const paidCents = summary.paidByDebt.get(debt.id) ?? 0;
  return getPlanningTarget(debt, paidCents, remaining, insight).cents;
}

function getSettlementSavingsCents(debt: Debt, insight?: DebtNegotiationInsight) {
  if (insight?.acceptedAgreementCents !== null && insight?.acceptedAgreementCents !== undefined) {
    return Math.max(0, debt.balanceCents - insight.acceptedAgreementCents);
  }
  return debt.settlementCents === null ? 0 : Math.max(0, debt.balanceCents - debt.settlementCents);
}

function getEmergencyNote(debt: Debt) {
  const note = [debt.reason, debt.notes].filter(Boolean).join(" | ");
  return note || "No notes yet.";
}

function buildMonthlyPaymentRows(payments: Payment[]): MonthlyPaymentRow[] {
  const latestDate = payments.length
    ? new Date(payments.reduce((latest, payment) => (payment.paidAt > latest ? payment.paidAt : latest), payments[0].paidAt))
    : new Date();
  const rows: MonthlyPaymentRow[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(latestDate.getFullYear(), latestDate.getMonth() - offset, 1);
    rows.push({
      amount: 0,
      key: getMonthKey(date),
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
    });
  }

  const amounts = new Map(rows.map((row) => [row.key, 0]));
  for (const payment of payments) {
    const key = getMonthKey(new Date(payment.paidAt));
    if (amounts.has(key)) {
      amounts.set(key, (amounts.get(key) ?? 0) + payment.amountCents);
    }
  }

  return rows.map((row) => ({ ...row, amount: amounts.get(row.key) ?? 0 }));
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

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function formatCompactCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  }).format(cents / 100);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(new Date(value));
}
