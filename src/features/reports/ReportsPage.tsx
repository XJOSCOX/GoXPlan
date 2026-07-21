import { ArrowLeftRight, Banknote, CalendarDays, CircleDollarSign, Handshake, Landmark, ReceiptText, TrendingDown, WalletCards } from "lucide-react";
import { buildFinancialSummary } from "../../lib/financialSummary";
import type { AccountMovement, Debt, DebtSnapshot, FinancialAccount, Income, Negotiation, Payment } from "../../types";

type ReportsPageProps = {
  accountMovements: AccountMovement[];
  accounts: FinancialAccount[];
  debts: Debt[];
  debtSnapshots: DebtSnapshot[];
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
  signedAmount?: boolean;
  tone: "income" | "movement" | "negotiation" | "payment";
};

type DebtHistoryChartRow = {
  balanceCents: number;
  key: string;
  label: string;
  obligationCents: number;
};

type DebtHistoryMovementRow = {
  balanceChangeCents: number;
  creditorName: string;
  key: string;
  latestBalanceCents: number;
  latestSnapshotAt: string;
  obligationChangeCents: number;
};

type DebtHistoryReport = {
  balanceChangeCents: number;
  chartRows: DebtHistoryChartRow[];
  firstBalanceCents: number;
  firstObligationCents: number;
  hasHistory: boolean;
  latestBalanceCents: number;
  latestObligationCents: number;
  latestSnapshotAt: string | null;
  movementRows: DebtHistoryMovementRow[];
  obligationChangeCents: number;
  snapshotCount: number;
};

export function ReportsPage({ accountMovements, accounts, debts, debtSnapshots, income, negotiations, payments, onOpenIncome, onOpenPayments }: ReportsPageProps) {
  const financialSummary = buildFinancialSummary({ accountMovements, accounts, debts, income, negotiations, payments });
  const movementSummary = financialSummary.accountMovementSummary;
  const cashAccounts = financialSummary.cashAccounts;
  const totalPaid = financialSummary.totalPrincipalPaidCents;
  const fullRemainingBalance = financialSummary.fullRemainingBalanceCents;
  const currentObligations = financialSummary.currentObligationsCents;
  const startingBalance = fullRemainingBalance + totalPaid;
  const paidPercent = startingBalance ? Math.round((totalPaid / startingBalance) * 100) : 0;
  const totalIncome = financialSummary.totalIncomeNetCents;
  const availableCash = financialSummary.availableCashCents;
  const estimatedStartingCash = financialSummary.estimatedStartingCashCents;
  const acceptedAgreements = financialSummary.acceptedAgreements;
  const acceptedSavings = financialSummary.acceptedAgreementSavingsCents;
  const monthlyRows = buildMonthlyRows(income, payments, accountMovements);
  const maxMonthlyAmount = Math.max(
    ...monthlyRows.flatMap((row) => [row.incomeCents + row.adjustmentInCents, row.paymentCents + row.adjustmentOutCents]),
    1,
  );
  const hasMonthlyActivity = monthlyRows.some(
    (row) => row.incomeCents > 0 || row.paymentCents > 0 || row.adjustmentInCents > 0 || row.adjustmentOutCents > 0 || row.transferCents > 0,
  );
  const recentActivity = buildRecentActivity(income, payments, negotiations, accountMovements).slice(0, 10);
  const priorityRows = financialSummary.priorityExposureRows;
  const debtHistoryReport = buildDebtHistoryReport(debtSnapshots);
  const maxDebtHistoryValue = Math.max(...debtHistoryReport.chartRows.flatMap((row) => [row.balanceCents, row.obligationCents]), 1);

  return (
    <div className="page-stack reports-page">
      <section className="reports-header-panel panel">
        <div>
          <span className="section-kicker">Financial snapshot</span>
          <h2>{formatCurrency(availableCash)}</h2>
          <p>Available cash after recorded income, payments, transfers, and balance adjustments.</p>
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
          <Banknote size={17} />
          <span>Available cash</span>
          <strong className={availableCash < 0 ? "warning-text" : ""}>{formatCurrency(availableCash)}</strong>
          <em>{cashAccounts.length} cash account{cashAccounts.length === 1 ? "" : "s"}</em>
        </article>
        <article>
          <WalletCards size={16} />
          <span>Current obligations</span>
          <strong>{formatCurrency(currentObligations)}</strong>
          <em>{debts.length} debt{debts.length === 1 ? "" : "s"} tracked</em>
        </article>
        <article>
          <ReceiptText size={17} />
          <span>Payments recorded</span>
          <strong>{formatCurrency(totalPaid)}</strong>
          <em>{paidPercent}% of tracked debt movement</em>
        </article>
        <article>
          <TrendingDown size={17} />
          <span>Settlement savings</span>
          <strong>{formatCurrency(acceptedSavings)}</strong>
          <em>{acceptedAgreements.length} accepted agreement{acceptedAgreements.length === 1 ? "" : "s"}</em>
        </article>
      </section>

      <section className="panel report-panel debt-history-report-panel">
        <div className="report-panel-heading">
          <div>
            <h2>Debt history</h2>
            <p>Saved snapshots from debt changes and payment activity.</p>
          </div>
          <span>{debtHistoryReport.snapshotCount} snapshot{debtHistoryReport.snapshotCount === 1 ? "" : "s"}</span>
        </div>

        {debtHistoryReport.hasHistory ? (
          <>
            <div className="debt-history-report-grid">
              <article>
                <span>Balance change</span>
                <strong className={getHistoryChangeClass(debtHistoryReport.balanceChangeCents)}>{formatSignedCurrency(debtHistoryReport.balanceChangeCents)}</strong>
                <em>
                  {formatCurrency(debtHistoryReport.firstBalanceCents)} to {formatCurrency(debtHistoryReport.latestBalanceCents)}
                </em>
              </article>
              <article>
                <span>Obligation change</span>
                <strong className={getHistoryChangeClass(debtHistoryReport.obligationChangeCents)}>{formatSignedCurrency(debtHistoryReport.obligationChangeCents)}</strong>
                <em>
                  {formatCurrency(debtHistoryReport.firstObligationCents)} to {formatCurrency(debtHistoryReport.latestObligationCents)}
                </em>
              </article>
              <article>
                <span>Latest snapshot</span>
                <strong>{debtHistoryReport.latestSnapshotAt ? formatShortDate(debtHistoryReport.latestSnapshotAt) : "-"}</strong>
                <em>Most recent debt state saved</em>
              </article>
              <article>
                <span>Biggest movement</span>
                <strong>{debtHistoryReport.movementRows[0]?.creditorName ?? "-"}</strong>
                <em>{debtHistoryReport.movementRows[0] ? formatSignedCurrency(debtHistoryReport.movementRows[0].balanceChangeCents) : "No movement yet"}</em>
              </article>
            </div>

            <div className="debt-history-report-body">
              <div className="debt-history-report-chart" aria-label="Debt balance and obligation history">
                {debtHistoryReport.chartRows.map((row) => (
                  <div className="debt-history-report-column" key={row.key}>
                    <div>
                      <span
                        className="balance"
                        style={{ height: `${getBarHeight(row.balanceCents, maxDebtHistoryValue)}%` }}
                        title={`Balance ${formatCurrency(row.balanceCents)}`}
                      />
                      <span
                        className="obligation"
                        style={{ height: `${getBarHeight(row.obligationCents, maxDebtHistoryValue)}%` }}
                        title={`Obligations ${formatCurrency(row.obligationCents)}`}
                      />
                    </div>
                    <strong>{row.label}</strong>
                  </div>
                ))}
              </div>

              <div className="debt-history-report-list">
                <div className="debt-history-report-list-head">
                  <span>Largest changes</span>
                  <em>Balance / obligation</em>
                </div>
                {debtHistoryReport.movementRows.slice(0, 5).map((row) => (
                  <div className="debt-history-report-row" key={row.key}>
                    <div>
                      <strong>{row.creditorName}</strong>
                      <span>{formatShortDate(row.latestSnapshotAt)}</span>
                    </div>
                    <div>
                      <strong className={getHistoryChangeClass(row.balanceChangeCents)}>{formatSignedCurrency(row.balanceChangeCents)}</strong>
                      <em className={getHistoryChangeClass(row.obligationChangeCents)}>{formatSignedCurrency(row.obligationChangeCents)}</em>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="report-empty-state">
            <TrendingDown size={18} />
            <strong>No debt history yet.</strong>
            <span>Edit a debt or record a payment to start building snapshot reports.</span>
          </div>
        )}
      </section>

      <section className="reports-main-grid reports-cash-grid">
        <article className="panel report-panel report-chart-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Cash flow</h2>
              <p>Deposits and debt payments by month. Transfers are tracked separately.</p>
            </div>
            <span>Last 6 months</span>
          </div>

          {hasMonthlyActivity ? (
            <>
              <div className="cashflow-chart" aria-label="Monthly deposits and debt payments">
                {monthlyRows.map((row) => {
                  const depositsCents = row.incomeCents + row.adjustmentInCents;
                  const outflowCents = row.paymentCents + row.adjustmentOutCents;
                  return (
                    <div className="cashflow-month" key={row.key}>
                      <div>
                        <span
                          className="cashflow-bar income"
                          style={{ height: `${getBarHeight(depositsCents, maxMonthlyAmount)}%` }}
                          title={`Deposits ${formatCurrency(depositsCents)}`}
                        />
                        <span
                          className="cashflow-bar payment"
                          style={{ height: `${getBarHeight(outflowCents, maxMonthlyAmount)}%` }}
                          title={`Payments ${formatCurrency(outflowCents)}`}
                        />
                      </div>
                      <strong>{row.label}</strong>
                    </div>
                  );
                })}
              </div>

              <div className="cashflow-legend">
                <span>
                  <i className="income" /> Deposits
                </span>
                <span>
                  <i className="payment" /> Payments
                </span>
                <span>{formatCurrency(movementSummary.transferVolumeCents)} transferred</span>
              </div>
            </>
          ) : (
            <div className="report-empty-state cashflow-empty-state">
              <Banknote size={18} />
              <strong>No cash flow yet.</strong>
              <span>Add income, move cash, or record a payment to create this chart.</span>
            </div>
          )}
        </article>

        <article className="panel report-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Cash statement</h2>
              <p>How recorded activity connects to available cash.</p>
            </div>
            <span>{income.length + payments.length + accountMovements.length} records</span>
          </div>

          <div className="cash-statement-list">
            <ReportMoneyRow label="Starting cash estimate" value={estimatedStartingCash} />
            <ReportMoneyRow label="Income deposited" value={totalIncome} />
            <ReportMoneyRow label="Debt payments" tone="negative" value={-totalPaid} />
            <ReportMoneyRow label="Balance adjustments" value={movementSummary.adjustmentInCents - movementSummary.adjustmentOutCents} signed />
            <ReportMoneyRow label="Current cash" value={availableCash} strong />
          </div>

          <div className="cash-statement-note">
            <ArrowLeftRight size={15} />
            <span>{formatCurrency(movementSummary.transferVolumeCents)} moved between accounts without changing total cash.</span>
          </div>
        </article>
      </section>

      <section className="reports-main-grid">
        <article className="panel report-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Debt progress</h2>
              <p>Paid amount against remaining balances.</p>
            </div>
            <span>{paidPercent}% paid</span>
          </div>

          <div className="report-progress-card">
            <div className="report-progress-track" aria-label={`${paidPercent}% paid`}>
              <span style={{ width: `${Math.min(100, paidPercent)}%` }} />
            </div>
            <div className="report-progress-values">
              <span>
                Paid
                <strong>{formatCurrency(totalPaid)}</strong>
              </span>
              <span>
                Remaining
                <strong>{formatCurrency(fullRemainingBalance)}</strong>
              </span>
            </div>
          </div>

          <div className="priority-mini-list">
            {priorityRows.map((row) => (
              <div className={`priority-mini-row priority-${row.level.toLowerCase()}`} key={row.level}>
                <div>
                  <span>{row.level}</span>
                  <em>{row.count} debt{row.count === 1 ? "" : "s"}</em>
                </div>
                <strong>{formatCurrency(row.amountCents)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel report-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Cash accounts</h2>
              <p>Where accessible money is sitting right now.</p>
            </div>
            <span>{cashAccounts.length}</span>
          </div>

          {cashAccounts.length ? (
            <div className="cash-account-list">
              {cashAccounts
                .slice()
                .sort((left, right) => right.availableBalanceCents - left.availableBalanceCents || left.name.localeCompare(right.name))
                .slice(0, 5)
                .map((account) => (
                  <div key={account.id}>
                    <span>
                      <Landmark size={15} />
                      {account.name}
                    </span>
                    <strong>{formatCurrency(account.availableBalanceCents)}</strong>
                  </div>
                ))}
            </div>
          ) : (
            <div className="report-empty-state">
              <Landmark size={18} />
              <strong>No cash accounts yet.</strong>
              <span>Add a bank or cash account to show balances here.</span>
            </div>
          )}
        </article>
      </section>

      <section className="reports-main-grid">
        <article className="panel report-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Agreements</h2>
              <p>Accepted settlements in the plan.</p>
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
              <span>Accepted settlement records will appear here.</span>
            </div>
          )}
        </article>

        <article className="panel report-panel">
          <div className="report-panel-heading">
            <div>
              <h2>Recent activity</h2>
              <p>Latest records saved in GoXPlan.</p>
            </div>
            <span>{recentActivity.length}</span>
          </div>

          {recentActivity.length ? (
            <div className="activity-report-list">
              {recentActivity.map((activity) => (
                <div className={`activity-report-item ${activity.tone}`} key={activity.id}>
                  <span className="activity-report-icon">{getActivityIcon(activity.tone)}</span>
                  <div>
                    <strong>{activity.label}</strong>
                    <span>{activity.meta}</span>
                  </div>
                  <div>
                    <strong>{activity.signedAmount ? formatSignedCurrency(activity.amountCents) : formatCurrency(activity.amountCents)}</strong>
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

function ReportMoneyRow({ label, signed = false, strong = false, tone, value }: { label: string; signed?: boolean; strong?: boolean; tone?: "negative"; value: number }) {
  return (
    <div className={strong ? "strong" : ""}>
      <span>{label}</span>
      <strong className={tone === "negative" || value < 0 ? "negative-money" : ""}>{signed ? formatSignedCurrency(value) : formatCurrency(value)}</strong>
    </div>
  );
}

function buildDebtHistoryReport(debtSnapshots: DebtSnapshot[]): DebtHistoryReport {
  const sortedSnapshots = debtSnapshots
    .slice()
    .sort((left, right) => new Date(left.snapshotAt).getTime() - new Date(right.snapshotAt).getTime() || left.creditorName.localeCompare(right.creditorName));

  if (!sortedSnapshots.length) {
    return {
      balanceChangeCents: 0,
      chartRows: [],
      firstBalanceCents: 0,
      firstObligationCents: 0,
      hasHistory: false,
      latestBalanceCents: 0,
      latestObligationCents: 0,
      latestSnapshotAt: null,
      movementRows: [],
      obligationChangeCents: 0,
      snapshotCount: 0,
    };
  }

  const currentDebtState = new Map<string, { balanceCents: number; obligationCents: number }>();
  const dailyRows = new Map<string, DebtHistoryChartRow>();

  for (const snapshot of sortedSnapshots) {
    const key = getDebtSnapshotKey(snapshot);
    currentDebtState.set(key, {
      balanceCents: getEffectiveSnapshotBalance(snapshot),
      obligationCents: getEffectiveSnapshotObligation(snapshot),
    });

    const dateKey = getDateKey(snapshot.snapshotAt);
    const totals = sumDebtHistoryState(currentDebtState);
    dailyRows.set(dateKey, {
      balanceCents: totals.balanceCents,
      key: dateKey,
      label: formatShortDate(snapshot.snapshotAt),
      obligationCents: totals.obligationCents,
    });
  }

  const chartRows = Array.from(dailyRows.values()).slice(-8);
  const firstRow = chartRows[0];
  const latestRow = chartRows[chartRows.length - 1];
  const movementRows = buildDebtMovementRows(sortedSnapshots);

  return {
    balanceChangeCents: latestRow.balanceCents - firstRow.balanceCents,
    chartRows,
    firstBalanceCents: firstRow.balanceCents,
    firstObligationCents: firstRow.obligationCents,
    hasHistory: true,
    latestBalanceCents: latestRow.balanceCents,
    latestObligationCents: latestRow.obligationCents,
    latestSnapshotAt: sortedSnapshots[sortedSnapshots.length - 1].snapshotAt,
    movementRows,
    obligationChangeCents: latestRow.obligationCents - firstRow.obligationCents,
    snapshotCount: sortedSnapshots.length,
  };
}

function buildDebtMovementRows(sortedSnapshots: DebtSnapshot[]) {
  const byDebt = new Map<string, DebtSnapshot[]>();
  for (const snapshot of sortedSnapshots) {
    const key = getDebtSnapshotKey(snapshot);
    byDebt.set(key, [...(byDebt.get(key) ?? []), snapshot]);
  }

  return Array.from(byDebt.entries())
    .map(([key, snapshots]) => {
      const first = snapshots[0];
      const latest = snapshots[snapshots.length - 1];
      return {
        balanceChangeCents: getEffectiveSnapshotBalance(latest) - getEffectiveSnapshotBalance(first),
        creditorName: latest.creditorName || first.creditorName,
        key,
        latestBalanceCents: getEffectiveSnapshotBalance(latest),
        latestSnapshotAt: latest.snapshotAt,
        obligationChangeCents: getEffectiveSnapshotObligation(latest) - getEffectiveSnapshotObligation(first),
      };
    })
    .sort(
      (left, right) =>
        Math.abs(right.balanceChangeCents) - Math.abs(left.balanceChangeCents) ||
        Math.abs(right.obligationChangeCents) - Math.abs(left.obligationChangeCents) ||
        right.latestBalanceCents - left.latestBalanceCents ||
        left.creditorName.localeCompare(right.creditorName),
    );
}

function buildMonthlyRows(income: Income[], payments: Payment[], movements: AccountMovement[]) {
  const latestDate = getLatestDate([...income.map((item) => item.receivedAt), ...payments.map((item) => item.paidAt), ...movements.map((item) => item.occurredAt)]);
  const rows = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(latestDate.getFullYear(), latestDate.getMonth() - offset, 1);
    rows.push({
      adjustmentInCents: 0,
      adjustmentOutCents: 0,
      incomeCents: 0,
      key: getMonthKey(date),
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
      paymentCents: 0,
      transferCents: 0,
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
  for (const movement of movements) {
    const row = byMonth.get(getMonthKey(new Date(movement.occurredAt)));
    if (!row) continue;
    if (movement.fromAccountId && movement.toAccountId) row.transferCents += movement.amountCents;
    else if (movement.toAccountId) row.adjustmentInCents += movement.amountCents;
    else if (movement.fromAccountId) row.adjustmentOutCents += movement.amountCents;
  }

  return rows;
}

function buildRecentActivity(income: Income[], payments: Payment[], negotiations: Negotiation[], movements: AccountMovement[]): ActivityItem[] {
  const activity: ActivityItem[] = [
    ...income.map((item) => ({
      amountCents: item.netAmountCents,
      date: item.receivedAt,
      id: `income:${item.id}`,
      label: item.source,
      meta: item.destinationAccountName ? `Income to ${item.destinationAccountName}` : "Income",
      tone: "income" as const,
    })),
    ...payments.map((payment) => ({
      amountCents: payment.amountCents,
      date: payment.paidAt,
      id: `payment:${payment.id}`,
      label: payment.debtName ?? "Removed debt",
      meta: payment.accountName ? `Payment from ${payment.accountName}` : "Payment",
      tone: "payment" as const,
    })),
    ...movements.map((movement) => ({
      amountCents: getActivityMovementAmount(movement),
      date: movement.occurredAt,
      id: `movement:${movement.id}`,
      label: getMovementLabel(movement),
      meta: getMovementMeta(movement),
      signedAmount: !(movement.fromAccountId && movement.toAccountId),
      tone: "movement" as const,
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

function getActivityMovementAmount(movement: AccountMovement) {
  if (movement.fromAccountId && !movement.toAccountId) return -movement.amountCents;
  return movement.amountCents;
}

function getMovementLabel(movement: AccountMovement) {
  if (movement.fromAccountName && movement.toAccountName) return `${movement.fromAccountName} to ${movement.toAccountName}`;
  return movement.toAccountName ?? movement.fromAccountName ?? "Account movement";
}

function getMovementMeta(movement: AccountMovement) {
  if (movement.fromAccountId && movement.toAccountId) return "Transfer";
  if (movement.toAccountId) return "Balance increase";
  if (movement.fromAccountId) return "Balance decrease";
  return "Account movement";
}

function getActivityIcon(tone: ActivityItem["tone"]) {
  if (tone === "income") return <CircleDollarSign size={15} />;
  if (tone === "payment") return <ReceiptText size={15} />;
  if (tone === "movement") return <ArrowLeftRight size={15} />;
  return <Handshake size={15} />;
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

function getDebtSnapshotKey(snapshot: DebtSnapshot) {
  return snapshot.debtId ?? `removed:${snapshot.creditorName.toLowerCase().trim()}`;
}

function getEffectiveSnapshotBalance(snapshot: DebtSnapshot) {
  return snapshot.reason === "DEBT_DELETED" ? 0 : snapshot.balanceCents;
}

function getEffectiveSnapshotObligation(snapshot: DebtSnapshot) {
  return snapshot.reason === "DEBT_DELETED" ? 0 : snapshot.obligationCents;
}

function sumDebtHistoryState(state: Map<string, { balanceCents: number; obligationCents: number }>) {
  return Array.from(state.values()).reduce(
    (totals, item) => ({
      balanceCents: totals.balanceCents + item.balanceCents,
      obligationCents: totals.obligationCents + item.obligationCents,
    }),
    { balanceCents: 0, obligationCents: 0 },
  );
}

function getDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10) || value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getHistoryChangeClass(cents: number) {
  if (cents < 0) return "history-change-good";
  if (cents > 0) return "history-change-bad";
  return "";
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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function formatSignedCurrency(cents: number) {
  const prefix = cents > 0 ? "+" : cents < 0 ? "-" : "";
  return `${prefix}${formatCurrency(Math.abs(cents))}`;
}
