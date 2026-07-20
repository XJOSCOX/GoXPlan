import { ArrowRight, Banknote, CalendarDays, CircleDollarSign, Handshake, ReceiptText, TrendingDown, WalletCards } from "lucide-react";
import { getDebtPriorityLevel } from "../../lib/debtPriority";
import { buildNegotiationInsights, getPlanningTarget, type DebtNegotiationInsight } from "../../lib/negotiationTargets";
import type { Debt, Income, Negotiation, Payment } from "../../types";

type ReportsPageProps = {
  debts: Debt[];
  income: Income[];
  negotiations: Negotiation[];
  payments: Payment[];
  onOpenIncome: () => void;
  onOpenPayments: () => void;
};

type ActivityItem = {
  amountCents: number;
  date: string;
  id: string;
  label: string;
  meta: string;
  tone: "income" | "negotiation" | "payment";
};

export function ReportsPage({ debts, income, negotiations, payments, onOpenIncome, onOpenPayments }: ReportsPageProps) {
  const paymentSummary = summarizePayments(payments);
  const negotiationInsights = buildNegotiationInsights(negotiations);
  const totalPaid = [...paymentSummary.paidByDebt.values()].reduce((sum, amount) => sum + amount, 0);
  const currentBalance = debts.reduce((sum, debt) => sum + getRemainingCents(debt, paymentSummary), 0);
  const startingBalance = currentBalance + totalPaid;
  const paidPercent = startingBalance ? Math.round((totalPaid / startingBalance) * 100) : 0;
  const totalIncome = income.reduce((sum, item) => sum + item.netAmountCents, 0);
  const availableIncome = income.reduce((sum, item) => sum + item.remainingAmountCents, 0);
  const acceptedAgreements = buildAcceptedAgreements(negotiations, debts);
  const acceptedSavings = acceptedAgreements.reduce((sum, item) => sum + item.savingsCents, 0);
  const monthlyRows = buildMonthlyRows(income, payments);
  const maxMonthlyAmount = Math.max(...monthlyRows.flatMap((row) => [row.incomeCents, row.paymentCents]), 1);
  const hasMonthlyActivity = monthlyRows.some((row) => row.incomeCents > 0 || row.paymentCents > 0);
  const recentActivity = buildRecentActivity(income, payments, negotiations).slice(0, 8);
  const priorityRows = buildPriorityRows(debts, paymentSummary, negotiationInsights);

  return (
    <div className="page-stack reports-page">
      <section className="reports-hero panel">
        <div>
          <span className="section-kicker">Money movement</span>
          <h2>Reports</h2>
          <p>Track what came in, what went out, and how the debt plan is moving over time.</p>
        </div>
        <div className="reports-hero-actions">
          <button className="icon-text-button" type="button" onClick={onOpenIncome}>
            <Banknote size={17} />
            Add income
          </button>
          <button className="primary-button compact" type="button" onClick={onOpenPayments}>
            <ReceiptText size={17} />
            Record payment
          </button>
        </div>
      </section>

      <section className="reports-summary-grid">
        <article>
          <WalletCards size={17} />
          <span>Current debt balance</span>
          <strong>{formatCurrency(currentBalance)}</strong>
          <em>{debts.length} debts tracked</em>
        </article>
        <article>
          <ReceiptText size={17} />
          <span>Total paid</span>
          <strong>{formatCurrency(totalPaid)}</strong>
          <em>{paidPercent}% of tracked movement</em>
        </article>
        <article>
          <Banknote size={17} />
          <span>Net income recorded</span>
          <strong>{formatCurrency(totalIncome)}</strong>
          <em>{formatCurrency(availableIncome)} still available</em>
        </article>
        <article>
          <TrendingDown size={17} />
          <span>Accepted savings</span>
          <strong>{formatCurrency(acceptedSavings)}</strong>
          <em>{acceptedAgreements.length} accepted agreement{acceptedAgreements.length === 1 ? "" : "s"}</em>
        </article>
      </section>

      <section className="reports-grid">
        <article className="panel report-panel report-chart-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Monthly cash flow</h2>
              <p>Income compared with payments recorded in the same month.</p>
            </div>
            <span>Last 6 months</span>
          </div>

          {hasMonthlyActivity ? (
            <>
              <div className="cashflow-chart" aria-label="Monthly income and payments">
                {monthlyRows.map((row) => (
                  <div className="cashflow-month" key={row.key}>
                    <div>
                      <span
                        className="cashflow-bar income"
                        style={{ height: `${getBarHeight(row.incomeCents, maxMonthlyAmount)}%` }}
                        title={`Income ${formatCurrency(row.incomeCents)}`}
                      />
                      <span
                        className="cashflow-bar payment"
                        style={{ height: `${getBarHeight(row.paymentCents, maxMonthlyAmount)}%` }}
                        title={`Payments ${formatCurrency(row.paymentCents)}`}
                      />
                    </div>
                    <strong>{row.label}</strong>
                  </div>
                ))}
              </div>

              <div className="cashflow-legend">
                <span><i className="income" /> Income</span>
                <span><i className="payment" /> Payments</span>
              </div>
            </>
          ) : (
            <div className="report-empty-state cashflow-empty-state">
              <Banknote size={18} />
              <strong>No cash flow yet.</strong>
              <span>Income and payments will create this monthly chart.</span>
            </div>
          )}
        </article>

        <article className="panel report-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Debt movement</h2>
              <p>Based on the payment records saved so far.</p>
            </div>
            <span>{paidPercent}% paid</span>
          </div>

          <div className="report-progress-row">
            <span>Starting balance</span>
            <strong>{formatCurrency(startingBalance)}</strong>
          </div>
          <div className="report-progress-track" aria-label={`${paidPercent}% paid`}>
            <span style={{ width: `${Math.min(100, paidPercent)}%` }} />
          </div>
          <div className="report-progress-row">
            <span>Remaining balance</span>
            <strong>{formatCurrency(currentBalance)}</strong>
          </div>

          <div className="priority-mini-list">
            {priorityRows.map((row) => (
              <div className={`priority-mini-row priority-${row.level.toLowerCase()}`} key={row.level}>
                <span>{row.level}</span>
                <strong>{formatCurrency(row.amountCents)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="reports-grid">
        <article className="panel report-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Accepted agreements</h2>
              <p>Settlement wins that are already part of the plan.</p>
            </div>
            <span>{acceptedAgreements.length}</span>
          </div>

          {acceptedAgreements.length ? (
            <div className="agreement-report-list">
              {acceptedAgreements.slice(0, 5).map((agreement) => (
                <div key={agreement.id}>
                  <div>
                    <strong>{agreement.debtName}</strong>
                    <span>{agreement.dueDate ? `Due ${formatDate(agreement.dueDate)}` : "No due date saved"}</span>
                  </div>
                  <div>
                    <strong>{formatCurrency(agreement.agreementCents)}</strong>
                    <em>{formatCurrency(agreement.savingsCents)} saved</em>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="report-empty-state">
              <Handshake size={18} />
              <strong>No accepted agreements yet.</strong>
              <span>Accepted settlement agreements will appear here.</span>
            </div>
          )}
        </article>

        <article className="panel report-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Recent activity</h2>
              <p>Latest income, payments, and negotiation records.</p>
            </div>
            <span>{recentActivity.length}</span>
          </div>

          {recentActivity.length ? (
            <div className="activity-report-list">
              {recentActivity.map((activity) => (
                <div className={`activity-report-item ${activity.tone}`} key={activity.id}>
                  <span className="activity-report-icon">
                    {activity.tone === "income" ? <CircleDollarSign size={15} /> : activity.tone === "payment" ? <ReceiptText size={15} /> : <Handshake size={15} />}
                  </span>
                  <div>
                    <strong>{activity.label}</strong>
                    <span>{activity.meta}</span>
                  </div>
                  <div>
                    <strong>{formatCurrency(activity.amountCents)}</strong>
                    <span>
                      <CalendarDays size={14} />
                      {formatDate(activity.date)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="report-empty-state">
              <CalendarDays size={18} />
              <strong>No activity yet.</strong>
              <span>Reports will fill in as you add records.</span>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

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

function getRemainingCents(debt: Debt, summary: ReturnType<typeof summarizePayments>) {
  return summary.resultingBalanceByDebt.get(debt.id)?.amount ?? Math.max(0, debt.balanceCents - (summary.paidByDebt.get(debt.id) ?? 0));
}

function getObligationCents(debt: Debt, summary: ReturnType<typeof summarizePayments>, insight?: DebtNegotiationInsight) {
  const remaining = getRemainingCents(debt, summary);
  const paidCents = summary.paidByDebt.get(debt.id) ?? 0;
  return getPlanningTarget(debt, paidCents, remaining, insight).cents;
}

function buildAcceptedAgreements(negotiations: Negotiation[], debts: Debt[]) {
  const debtsById = new Map(debts.map((debt) => [debt.id, debt]));
  return negotiations
    .filter((negotiation) => negotiation.status === "ACCEPTED" && negotiation.finalAgreementCents !== null)
    .map((negotiation) => {
      const debt = negotiation.debtId ? debtsById.get(negotiation.debtId) : undefined;
      const originalCents = debt?.balanceCents ?? negotiation.balanceCents ?? 0;
      const agreementCents = negotiation.finalAgreementCents ?? 0;
      return {
        agreementCents,
        debtName: negotiation.debtName ?? debt?.creditorName ?? "Removed debt",
        dueDate: negotiation.dueDate,
        id: negotiation.id,
        savingsCents: Math.max(0, originalCents - agreementCents),
      };
    })
    .sort((left, right) => right.savingsCents - left.savingsCents || left.debtName.localeCompare(right.debtName));
}

function buildPriorityRows(debts: Debt[], summary: ReturnType<typeof summarizePayments>, insights: Map<string, DebtNegotiationInsight>) {
  const rows = new Map<string, { amountCents: number; count: number; level: string }>();

  for (const debt of debts) {
    const level = getDebtPriorityLevel(debt.priorityScore);
    const current = rows.get(level) ?? { amountCents: 0, count: 0, level };
    rows.set(level, {
      ...current,
      amountCents: current.amountCents + getObligationCents(debt, summary, insights.get(debt.id)),
      count: current.count + 1,
    });
  }

  return ["Emergency", "Critical", "High", "Medium", "Low"]
    .map((level) => rows.get(level))
    .filter((row): row is { amountCents: number; count: number; level: string } => Boolean(row && row.count > 0));
}

function buildMonthlyRows(income: Income[], payments: Payment[]) {
  const latestDate = getLatestDate([...income.map((item) => item.receivedAt), ...payments.map((item) => item.paidAt)]);
  const rows = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(latestDate.getFullYear(), latestDate.getMonth() - offset, 1);
    rows.push({
      incomeCents: 0,
      key: getMonthKey(date),
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
      paymentCents: 0,
    });
  }

  const byMonth = new Map(rows.map((row) => [row.key, row]));
  for (const item of income) {
    const row = byMonth.get(getMonthKey(new Date(item.receivedAt)));
    if (row) row.incomeCents += item.netAmountCents;
  }
  for (const payment of payments) {
    const row = byMonth.get(getMonthKey(new Date(payment.paidAt)));
    if (row) row.paymentCents += payment.amountCents;
  }

  return rows;
}

function buildRecentActivity(income: Income[], payments: Payment[], negotiations: Negotiation[]): ActivityItem[] {
  const activity: ActivityItem[] = [
    ...income.map((item) => ({
      amountCents: item.netAmountCents,
      date: item.receivedAt,
      id: `income:${item.id}`,
      label: item.source,
      meta: "Income",
      tone: "income" as const,
    })),
    ...payments.map((payment) => ({
      amountCents: payment.amountCents,
      date: payment.paidAt,
      id: `payment:${payment.id}`,
      label: payment.debtName ?? "Removed debt",
      meta: "Payment",
      tone: "payment" as const,
    })),
    ...negotiations.map((negotiation) => ({
      amountCents: negotiation.finalAgreementCents ?? negotiation.counterOfferCents ?? negotiation.userOfferCents ?? negotiation.currentOfferCents ?? 0,
      date: negotiation.contactDate,
      id: `negotiation:${negotiation.id}`,
      label: negotiation.debtName ?? "Removed debt",
      meta: `Negotiation - ${formatStatus(negotiation.status)}`,
      tone: "negotiation" as const,
    })),
  ];

  return activity.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

function getLatestDate(values: string[]) {
  const latest = values.reduce<Date | undefined>((current, value) => {
    const next = new Date(value);
    if (Number.isNaN(next.getTime())) return current;
    if (!current || next > current) return next;
    return current;
  }, undefined);

  return latest ?? new Date();
}

function getBarHeight(value: number, max: number) {
  return value ? Math.max(8, Math.round((value / max) * 100)) : 3;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}
