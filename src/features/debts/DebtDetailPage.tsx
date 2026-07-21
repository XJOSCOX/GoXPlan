import { ArrowLeft, ArrowRight, CalendarDays, CreditCard, Handshake, Info, ReceiptText, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { getDebtPriorityLevel } from "../../lib/debtPriority";
import {
  getDebtPlanningTarget,
  getDebtRemainingCents,
  getDebtSettlementSavingsCents,
  summarizePayments,
} from "../../lib/financialSummary";
import { buildNegotiationInsights } from "../../lib/negotiationTargets";
import type {
  Debt,
  DebtCategory,
  DebtSnapshot,
  DebtSnapshotReason,
  DebtStatus,
  Negotiation,
  NegotiationStatus,
  Payment,
  PaymentInput,
  PaymentType,
} from "../../types";

type DebtDetailPageProps = {
  debt?: Debt;
  debtSnapshots: DebtSnapshot[];
  negotiations: Negotiation[];
  payments: Payment[];
  onBack: () => void;
  onOpenNegotiations: () => void;
  onRecordPayment: (input: PaymentInput) => void;
};

const statusLabels: Record<DebtStatus, string> = {
  CLOSED: "Closed",
  COLLECTION: "Collection",
  NOT_REPORTED: "Not reported",
  OPEN: "Open",
  PAST_DUE: "Past due",
  SETTLED: "Settled",
};

const categoryLabels: Record<DebtCategory, string> = {
  AUTO_LOAN: "Auto loan",
  BNPL: "Buy now, pay later",
  COLLECTION: "Collection",
  CREDIT_CARD: "Credit card",
  MEDICAL: "Medical",
  OTHER: "Other",
  PERSONAL_LOAN: "Personal loan",
  RETAIL_FINANCING: "Retail financing",
  UTILITY: "Utility",
};

const paymentTypeLabels: Record<PaymentType, string> = {
  CATCH_UP: "Catch-up",
  EXTRA: "Extra",
  MINIMUM: "Minimum",
  PAYOFF: "Payoff",
  REGULAR: "Regular",
  SETTLEMENT: "Settlement",
};

const negotiationStatusLabels: Record<NegotiationStatus, string> = {
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
  CONTACTED: "Contacted",
  COUNTERED: "Countered",
  DECLINED: "Declined",
  FOLLOW_UP: "Follow-up",
  OFFER_SENT: "Offer sent",
  PLANNED: "Planned",
};

const snapshotReasonLabels: Record<DebtSnapshotReason, string> = {
  DEBT_CREATED: "Debt created",
  DEBT_DELETED: "Debt deleted",
  DEBT_UPDATED: "Debt updated",
  PAYMENT_DELETED: "Payment deleted",
  PAYMENT_EDITED: "Payment edited",
  PAYMENT_RECORDED: "Payment recorded",
};

export function DebtDetailPage({ debt, debtSnapshots, negotiations, payments, onBack, onOpenNegotiations, onRecordPayment }: DebtDetailPageProps) {
  const debtPayments = useMemo(
    () => (debt ? payments.filter((payment) => payment.debtId === debt.id).sort((left, right) => right.paidAt.localeCompare(left.paidAt)) : []),
    [debt, payments],
  );
  const debtNegotiations = useMemo(
    () =>
      debt
        ? negotiations
            .filter((negotiation) => negotiation.debtId === debt.id)
            .sort((left, right) => right.contactDate.localeCompare(left.contactDate) || right.updatedAt.localeCompare(left.updatedAt))
        : [],
    [debt, negotiations],
  );
  const debtHistory = useMemo(
    () => (debt ? debtSnapshots.filter((snapshot) => snapshot.debtId === debt.id).sort((left, right) => right.snapshotAt.localeCompare(left.snapshotAt)) : []),
    [debt, debtSnapshots],
  );
  const paymentSummary = useMemo(() => summarizePayments(payments), [payments]);
  const negotiationInsight = useMemo(() => buildNegotiationInsights(negotiations), [negotiations]);

  if (!debt) {
    return (
      <div className="page-stack debt-detail-page">
        <section className="panel debt-detail-empty">
          <button className="icon-text-button compact" type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to debts
          </button>
          <div>
            <h2>Debt not found</h2>
            <p>This debt may have been deleted or restored from a different backup.</p>
          </div>
        </section>
      </div>
    );
  }

  const detailDebt = debt;
  const insight = negotiationInsight.get(detailDebt.id);
  const target = getDebtPlanningTarget(debt, paymentSummary, insight);
  const remainingCents = getDebtRemainingCents(debt, paymentSummary);
  const level = getDebtPriorityLevel(detailDebt.priorityScore);
  const paidCents = paymentSummary.paidByDebt.get(detailDebt.id) ?? 0;
  const savingsCents = getDebtSettlementSavingsCents(debt, insight);
  const latestPayment = debtPayments[0];
  const latestNegotiation = debtNegotiations[0];
  const historyChartRows = buildHistoryChartRows(debtHistory);
  const timelineRows = buildTimelineRows(debt, debtHistory, debtPayments, debtNegotiations);

  function recordTargetPayment() {
    onRecordPayment({
      accountId: "",
      amount: target.cents > 0 ? centsToInput(target.cents) : "",
      confirmationNumber: "",
      debtId: detailDebt.id,
      interestAndFees: "",
      notes: "",
      paidDate: toDateInput(new Date().toISOString()),
      paymentMethod: "",
      paymentType: getPaymentTypeForTarget(target.label),
      principal: "",
      resultingBalance: "",
      updateDebtStatus: target.label === "Settlement" || target.label === "Agreement" || target.label === "Payoff",
    });
  }

  return (
    <div className="page-stack debt-detail-page">
      <section className={`panel debt-detail-hero priority-${level.toLowerCase()}`}>
        <div className="debt-detail-return">
          <button className="icon-text-button compact" type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to debts
          </button>
          <span className="status-pill">{statusLabels[debt.status]}</span>
        </div>

        <div className="debt-detail-hero-grid">
          <div className="debt-detail-title">
            <span>{categoryLabels[debt.category]} · Priority {debt.priority} · {level}</span>
            <h2>{debt.creditorName}</h2>
            <p>{debt.reason || "No reason saved yet."}</p>
          </div>

          <div className="debt-detail-target">
            <span>{target.label}</span>
            <strong>{formatCurrency(target.cents)}</strong>
            <button className="primary-button compact" type="button" onClick={recordTargetPayment} disabled={target.cents <= 0}>
              <ReceiptText size={16} />
              Record payment
            </button>
          </div>
        </div>
      </section>

      <section className="debt-detail-metrics">
        <MetricCard label="Remaining balance" value={formatCurrency(remainingCents)} icon={<CreditCard size={18} />} />
        <MetricCard label="Full balance" value={formatCurrency(debt.balanceCents)} />
        <MetricCard label="Paid so far" value={formatCurrency(paidCents)} />
        <MetricCard label="Possible savings" value={formatCurrency(savingsCents)} />
        <MetricCard label="History points" value={String(debtHistory.length)} />
      </section>

      <section className="panel debt-history-panel">
        <div className="detail-card-heading">
          <CalendarDays size={18} />
          <div>
            <h2>Balance history</h2>
            <p>{debtHistory.length ? "Saved balance movement for this debt." : "History starts after the first saved debt or payment change."}</p>
          </div>
        </div>

        {historyChartRows.length ? (
          <>
            <div className="debt-history-chart" aria-label="Debt balance history chart">
              {historyChartRows.map((row) => (
                <div className="debt-history-column" key={`${row.date}-${row.balanceCents}`} title={`${row.label}: ${formatCurrency(row.balanceCents)}`}>
                  <div className="debt-history-bar-shell">
                    <span style={{ height: `${Math.max(8, row.percent)}%` }} />
                  </div>
                  <strong>{row.label}</strong>
                  <small>{formatCompactCurrency(row.balanceCents)}</small>
                </div>
              ))}
            </div>
            <div className="debt-history-summary">
              <span>
                First <strong>{formatCurrency(historyChartRows[0].balanceCents)}</strong>
              </span>
              <span>
                Latest <strong>{formatCurrency(historyChartRows[historyChartRows.length - 1].balanceCents)}</strong>
              </span>
              <span>
                Change <strong>{formatCurrency(historyChartRows[historyChartRows.length - 1].balanceCents - historyChartRows[0].balanceCents)}</strong>
              </span>
            </div>
          </>
        ) : (
          <EmptyDetail icon={<CalendarDays size={18} />} text="No balance history has been saved for this debt yet." />
        )}
      </section>

      <section className="debt-detail-grid">
        <article className="panel debt-detail-card debt-detail-plan-card">
          <div className="detail-card-heading">
            <ShieldAlert size={18} />
            <div>
              <h2>Plan details</h2>
              <p>What matters for this account right now.</p>
            </div>
          </div>

          <div className="detail-data-grid">
            <DetailValue label="Past due" value={nullableCurrency(debt.pastDueCents)} />
            <DetailValue label="Minimum" value={nullableCurrency(debt.minimumPaymentCents)} />
            <DetailValue label="Settlement" value={nullableCurrency(debt.settlementCents)} />
            <DetailValue label="APR" value={debt.aprBasisPoints === null ? "-" : `${(debt.aprBasisPoints / 100).toFixed(2)}%`} />
            <DetailValue label="Reported" value={debt.reported ? "Yes" : "No"} />
            <DetailValue label="Tracked" value={formatDate(debt.trackedAt)} />
          </div>

          <div className="detail-note-box">
            <span>Notes</span>
            <p>{debt.notes || "No notes saved."}</p>
          </div>
        </article>

        <article className="panel debt-detail-card">
          <div className="detail-card-heading">
            <ReceiptText size={18} />
            <div>
              <h2>Payments</h2>
              <p>{debtPayments.length ? `${debtPayments.length} payment${debtPayments.length === 1 ? "" : "s"} recorded.` : "No payments yet."}</p>
            </div>
          </div>

          {debtPayments.length ? (
            <div className="detail-list">
              {debtPayments.slice(0, 5).map((payment) => (
                <div className="detail-list-row" key={payment.id}>
                  <div>
                    <strong>{formatCurrency(payment.amountCents)}</strong>
                    <span>{paymentTypeLabels[payment.paymentType]} · {formatDate(payment.paidAt)}</span>
                  </div>
                  <div>
                    <span>{payment.accountName ? `From ${payment.accountName}` : "No account linked"}</span>
                    <em>{payment.principalCents === null ? "Principal not split" : `${formatCurrency(payment.principalCents)} principal`}</em>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDetail icon={<ReceiptText size={18} />} text="Record the first payment when money moves." />
          )}
        </article>

        <article className="panel debt-detail-card">
          <div className="detail-card-heading">
            <Handshake size={18} />
            <div>
              <h2>Negotiations</h2>
              <p>{debtNegotiations.length ? `${debtNegotiations.length} contact${debtNegotiations.length === 1 ? "" : "s"} saved.` : "No negotiation records yet."}</p>
            </div>
          </div>

          {debtNegotiations.length ? (
            <div className="detail-list">
              {debtNegotiations.slice(0, 5).map((negotiation) => (
                <div className="detail-list-row" key={negotiation.id}>
                  <div>
                    <strong>{negotiationStatusLabels[negotiation.status]}</strong>
                    <span>{formatDate(negotiation.contactDate)} · {negotiation.contactMethod.toLowerCase()}</span>
                  </div>
                  <div>
                    <span>{formatNegotiationAmount(negotiation)}</span>
                    <em>{negotiation.payForDeleteIncluded ? "Pay-for-delete included" : "No pay-for-delete saved"}</em>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDetail icon={<Handshake size={18} />} text="Add offers, agreements, and follow-up dates." />
          )}

          <button className="icon-text-button compact detail-wide-button" type="button" onClick={onOpenNegotiations}>
            Open negotiations
            <ArrowRight size={16} />
          </button>
        </article>

        <article className="panel debt-detail-card">
          <div className="detail-card-heading">
            <CalendarDays size={18} />
            <div>
              <h2>Activity</h2>
              <p>Recent saved changes, payments, and negotiation notes.</p>
            </div>
          </div>

          <div className="debt-timeline">
            {timelineRows.slice(0, 10).map((row) => (
              <div className="debt-timeline-row" key={`${row.date}-${row.label}-${row.value}`}>
                <span />
                <div>
                  <strong>{row.label}</strong>
                  <p>{row.value}</p>
                  {row.meta && <em>{row.meta}</em>}
                </div>
                <time>{formatShortDate(row.date)}</time>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="debt-detail-next-row">
        <article className="panel debt-detail-mini">
          <Info size={18} />
          <div>
            <span>Latest payment</span>
            <strong>{latestPayment ? `${formatCurrency(latestPayment.amountCents)} on ${formatShortDate(latestPayment.paidAt)}` : "None yet"}</strong>
          </div>
        </article>
        <article className="panel debt-detail-mini">
          <Handshake size={18} />
          <div>
            <span>Latest negotiation</span>
            <strong>{latestNegotiation ? `${negotiationStatusLabels[latestNegotiation.status]} on ${formatShortDate(latestNegotiation.contactDate)}` : "None yet"}</strong>
          </div>
        </article>
      </section>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <article className="panel debt-detail-metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyDetail({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="detail-empty">
      {icon}
      <span>{text}</span>
    </div>
  );
}

type HistoryChartRow = {
  balanceCents: number;
  date: string;
  label: string;
  percent: number;
};

function buildHistoryChartRows(snapshots: DebtSnapshot[]): HistoryChartRow[] {
  const rows = [...snapshots]
    .sort((left, right) => left.snapshotAt.localeCompare(right.snapshotAt) || left.createdAt.localeCompare(right.createdAt))
    .slice(-8);
  const maxBalance = Math.max(...rows.map((snapshot) => snapshot.balanceCents), 1);

  return rows.map((snapshot) => ({
    balanceCents: snapshot.balanceCents,
    date: snapshot.snapshotAt,
    label: formatShortDate(snapshot.snapshotAt),
    percent: Math.round((Math.max(0, snapshot.balanceCents) / maxBalance) * 100),
  }));
}

type ActivityRow = {
  date: string;
  label: string;
  meta?: string;
  value: string;
};

function buildTimelineRows(debt: Debt, snapshots: DebtSnapshot[], payments: Payment[], negotiations: Negotiation[]) {
  const chronologicalSnapshots = [...snapshots].sort(
    (left, right) => left.snapshotAt.localeCompare(right.snapshotAt) || left.createdAt.localeCompare(right.createdAt),
  );
  const previousBalanceBySnapshot = new Map<string, number | null>();

  chronologicalSnapshots.forEach((snapshot, index) => {
    previousBalanceBySnapshot.set(snapshot.id, index === 0 ? null : chronologicalSnapshots[index - 1].balanceCents);
  });

  const rows: ActivityRow[] = [
    {
      date: debt.trackedAt,
      label: "Debt tracked",
      value: `${statusLabels[debt.status]} · ${formatCurrency(debt.balanceCents)}`,
    },
    ...snapshots.map((snapshot) => ({
      date: snapshot.snapshotAt,
      label: snapshotReasonLabels[snapshot.reason],
      value: `${formatCurrency(snapshot.balanceCents)} balance · ${formatCurrency(snapshot.obligationCents)} obligation`,
    })),
    ...payments.map((payment) => ({
      date: payment.paidAt,
      label: "Payment recorded",
      value: `${formatCurrency(payment.amountCents)} · ${paymentTypeLabels[payment.paymentType]}`,
    })),
    ...negotiations.map((negotiation) => ({
      date: negotiation.contactDate,
      label: "Negotiation logged",
      value: `${negotiationStatusLabels[negotiation.status]} · ${formatNegotiationAmount(negotiation)}`,
    })),
  ];

  return rows.sort((left, right) => right.date.localeCompare(left.date));
}

function getPaymentTypeForTarget(label: string): PaymentType {
  if (label === "Settlement" || label === "Agreement") return "SETTLEMENT";
  if (label === "Past due") return "CATCH_UP";
  if (label === "Minimum") return "MINIMUM";
  if (label === "Payoff") return "PAYOFF";
  return "REGULAR";
}

function formatNegotiationAmount(negotiation: Negotiation) {
  const amount =
    negotiation.finalAgreementCents ??
    negotiation.counterOfferCents ??
    negotiation.userOfferCents ??
    negotiation.currentOfferCents ??
    negotiation.balanceCents;
  return amount === null ? "No amount saved" : formatCurrency(amount);
}

function nullableCurrency(cents: number | null) {
  return cents === null ? "-" : formatCurrency(cents);
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function toDateInput(value: string) {
  return value.slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(new Date(value));
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

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}
