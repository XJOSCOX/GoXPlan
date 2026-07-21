import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Route, Save, Shield, Target } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { getDebtPriorityLevel } from "../../lib/debtPriority";
import {
  buildFinancialSummary,
  getDebtPlanningTarget,
  getDebtRemainingCents,
  getDebtSettlementSavingsCents,
  summarizePayments,
  type PaymentSummary,
} from "../../lib/financialSummary";
import { buildNegotiationInsights, getNegotiationDeadlineTime, type DebtNegotiationInsight } from "../../lib/negotiationTargets";
import { buildPayoffPeriodProgress, formatPayoffPeriodRange } from "../../lib/payoffPeriods";
import type {
  AccountMovement,
  Debt,
  FinancialAccount,
  Income,
  Negotiation,
  Payment,
  PaymentInput,
  PaymentType,
  PayoffBudgetFrequency,
  PayoffMilestone,
  PayoffSettings,
  PayoffSettingsInput,
  PayoffStrategy,
} from "../../types";

type PayoffPlanPageProps = {
  accountMovements: AccountMovement[];
  debts: Debt[];
  financialAccounts: FinancialAccount[];
  income: Income[];
  negotiations: Negotiation[];
  payoffMilestones: PayoffMilestone[];
  payments: Payment[];
  settings: PayoffSettings;
  onOpenDebts: () => void;
  onOpenIncome: () => void;
  onOpenPayments: (payment?: PaymentInput) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaveSettings: (input: PayoffSettingsInput) => Promise<void>;
};

type PlanDebt = Debt & {
  allocationCents: number;
  cumulativePeriods: number | null;
  explanation: string;
  fullRemainingAfterAllocationCents: number;
  fullRemainingCents: number;
  paidCents: number;
  payForDeleteFromNegotiation: boolean;
  targetDeadlineAt: string | null;
  targetLabel: string;
  targetRemainingAfterAllocationCents: number;
  targetRemainingCents: number;
  targetSource: "debt" | "negotiation";
};

const strategyLabels: Record<PayoffStrategy, string> = {
  HYBRID: "Hybrid",
  EMERGENCY_FIRST: "Emergency first",
  CREDIT_REPAIR_FIRST: "Credit repair first",
  SNOWBALL: "Snowball",
  AVALANCHE: "Avalanche",
  SETTLEMENT_FIRST: "Settlement first",
  MANUAL: "Manual order",
  PRIORITY: "Priority order",
  LOW_BALANCE: "Smallest balance",
  HIGH_BALANCE: "Largest balance",
  SETTLEMENT: "Settlement target",
};

const budgetFrequencyLabels: Record<PayoffBudgetFrequency, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

const budgetFrequencyCopy: Record<PayoffBudgetFrequency, { estimate: string; singular: string; thisPeriod: string }> = {
  WEEKLY: { estimate: "wk", singular: "Week", thisPeriod: "this week" },
  MONTHLY: { estimate: "mo", singular: "Month", thisPeriod: "this month" },
  YEARLY: { estimate: "yr", singular: "Year", thisPeriod: "this year" },
};

export function PayoffPlanPage({
  debts,
  accountMovements,
  financialAccounts,
  income,
  negotiations,
  payoffMilestones,
  payments,
  settings,
  onOpenDebts,
  onOpenIncome,
  onOpenPayments,
  onDirtyChange,
  onSaveSettings,
}: PayoffPlanPageProps) {
  const savedForm = useMemo(() => payoffSettingsToForm(settings), [settings]);
  const [form, setForm] = useState<PayoffSettingsInput>(() => savedForm);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(savedForm);
  }, [savedForm]);

  const hasUnsavedChanges = useMemo(() => serializePayoffForm(form) !== serializePayoffForm(savedForm), [form, savedForm]);
  const hasManualEdits = Object.keys(form.manualAllocations).length > 0;

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const financialSummary = useMemo(
    () => buildFinancialSummary({ accountMovements, accounts: financialAccounts, debts, income, negotiations, payments }),
    [accountMovements, debts, financialAccounts, income, negotiations, payments],
  );
  const availableCashCents = financialSummary.availableCashCents;

  const draftBudgetCents = parseMoneyInputLoose(form.monthlyBudget) ?? 0;
  const draftEmergencyReserveCents = parseMoneyInputLoose(form.emergencyReserve) ?? 0;
  const draftMaxAccountsPerRound = parseMaxAccountsInput(form.maxAccountsPerRound);
  const safeAvailableCash = Math.max(0, availableCashCents - draftEmergencyReserveCents);
  const planBudgetCents = draftBudgetCents > 0 ? draftBudgetCents : safeAvailableCash;
  const manualAllocationCents = useMemo(() => parseEditableManualAllocations(form.manualAllocations), [form.manualAllocations]);
  const negotiationInsights = useMemo(() => buildNegotiationInsights(negotiations), [negotiations]);
  const activePeriodProgress = useMemo(
    () => buildPayoffPeriodProgress(form.budgetFrequency, planBudgetCents, payments),
    [form.budgetFrequency, payments, planBudgetCents],
  );
  const recommendationBudgetCents =
    planBudgetCents > 0
      ? getPayoffRecommendationBudgetCents({
          periodRemainingCents: activePeriodProgress.remainingCents,
          safeAvailableCashCents: safeAvailableCash,
        })
      : 0;
  const plan = useMemo(
    () =>
      buildPayoffPlan(
        debts,
        payments,
        recommendationBudgetCents,
        form.strategy,
        draftMaxAccountsPerRound,
        manualAllocationCents,
        negotiationInsights,
        planBudgetCents,
      ),
    [debts, draftMaxAccountsPerRound, form.strategy, manualAllocationCents, negotiationInsights, payments, planBudgetCents, recommendationBudgetCents],
  );
  const periodHistoryRows = useMemo(
    () => buildPeriodHistoryRows(payoffMilestones, activePeriodProgress, form.budgetFrequency),
    [activePeriodProgress, form.budgetFrequency, payoffMilestones],
  );

  const recommendationDebts = plan.planDebts.filter((debt) => debt.allocationCents > 0 || hasManualAllocation(form.manualAllocations, debt.id));
  const hasRecommendedPayments = recommendationDebts.length > 0;
  const allocatedNow = plan.allocatedCents;
  const cashRemaining = plan.remainingBudgetCents;
  const allocationOverBudget = plan.isOverBudget;
  const frequencyCopy = budgetFrequencyCopy[form.budgetFrequency];
  const recommendationDebtIds = new Set(recommendationDebts.map((debt) => debt.id));
  const futureOrderDebts = plan.planDebts.filter((debt) => !recommendationDebtIds.has(debt.id));
  const visibleOrderDebts = futureOrderDebts.slice(0, 8);
  const hiddenOrderCount = Math.max(0, futureOrderDebts.length - visibleOrderDebts.length);
  const fullyFundedCount = recommendationDebts.filter((debt) => debt.targetRemainingAfterAllocationCents === 0).length;
  const partiallyFundedCount = recommendationDebts.filter((debt) => debt.allocationCents > 0 && debt.targetRemainingAfterAllocationCents > 0).length;
  const recommendedCopy = hasRecommendedPayments
    ? `${fullyFundedCount} clear, ${partiallyFundedCount} partial ${frequencyCopy.thisPeriod}.`
    : activePeriodProgress.isDone
      ? `Goal met ${frequencyCopy.thisPeriod}.`
      : "Ready after a budget or available cash.";
  const budgetValidation = getBudgetValidationMessage(form);
  const allocationWarning = allocationOverBudget
    ? `Allocations are ${formatCurrency(allocatedNow - recommendationBudgetCents)} above what remains ${frequencyCopy.thisPeriod}.`
    : "";
  const budgetWarning = getPayoffBudgetWarning({
    availableCashCents,
    budgetCents: draftBudgetCents,
    frequency: form.budgetFrequency,
    reserveCents: draftEmergencyReserveCents,
    safeAvailableCash,
    validationMessage: budgetValidation,
  });

  function focusBudgetField() {
    document.getElementById("payoff-debt-budget")?.focus();
  }

  function useSafeCash() {
    setForm((current) => ({ ...current, monthlyBudget: centsToInput(safeAvailableCash) }));
    window.requestAnimationFrame(focusBudgetField);
  }

  function setManualAllocation(debtId: string, value: string) {
    setForm((current) => ({ ...current, manualAllocations: { ...current.manualAllocations, [debtId]: value } }));
  }

  function clearManualAllocation(debtId: string) {
    setForm((current) => {
      const nextAllocations = { ...current.manualAllocations };
      delete nextAllocations[debtId];
      return { ...current, manualAllocations: nextAllocations };
    });
  }

  function resetManualAllocations() {
    setForm((current) => ({ ...current, manualAllocations: {} }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasUnsavedChanges || isSaving) return;
    setError("");

    const validationMessage = getBudgetValidationMessage(form);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSaving(true);

    try {
      await onSaveSettings(form);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save payoff settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-stack payoff-page">
      <section className="summary-strip payoff-summary-strip">
        <article>
          <span>Current obligations</span>
          <strong>{formatCurrency(financialSummary.currentObligationsCents)}</strong>
        </article>
        <article>
          <span>Paid {frequencyCopy.thisPeriod}</span>
          <strong>{formatCurrency(activePeriodProgress.paidCents)}</strong>
        </article>
        <article>
          <span>Recommended now</span>
          <strong>{formatCurrency(allocatedNow)}</strong>
        </article>
        <article>
          <span>Left {frequencyCopy.thisPeriod}</span>
          <strong>{formatCurrency(activePeriodProgress.remainingCents)}</strong>
        </article>
      </section>

      <section className="payoff-workspace-grid">
        <aside className="panel payoff-planner-sidebar">
          <div className="payoff-toolbar">
            <div className="payoff-panel-heading">
              <Target size={18} />
              <div>
                <h2>Planner</h2>
                <p>{budgetFrequencyLabels[form.budgetFrequency]} budget and cash check.</p>
              </div>
            </div>
            <span className={hasUnsavedChanges ? "count-pill unsaved-pill" : "count-pill"}>{hasUnsavedChanges ? "Unsaved changes" : `${plan.planDebts.length}`}</span>
          </div>

          <section className="payoff-plan-summary">
            <span>{budgetFrequencyLabels[form.budgetFrequency]} plan</span>
            <strong>{formatCurrency(planBudgetCents)}</strong>
            <div>
              <em>{formatCurrency(allocatedNow)} recommended</em>
              <em className={cashRemaining < 0 ? "warning-text" : ""}>{formatCurrency(cashRemaining)} unassigned</em>
            </div>
          </section>

          <section className={activePeriodProgress.isDone ? "payoff-period-card is-done" : "payoff-period-card"}>
            <div className="payoff-period-heading">
              <CalendarClock size={17} />
              <div>
                <span>{activePeriodProgress.label}</span>
                <strong>{formatPayoffPeriodRange(activePeriodProgress.periodStart, activePeriodProgress.periodEnd)}</strong>
              </div>
              <em>{activePeriodProgress.isDone ? "Done" : `${activePeriodProgress.paidPercent}%`}</em>
            </div>
            <div className="payoff-period-meter" aria-label={`${activePeriodProgress.paidPercent}% of period budget paid`}>
              <span style={{ width: `${activePeriodProgress.paidPercent}%` }} />
            </div>
            <div className="payoff-period-values">
              <span>
                Paid <strong>{formatCurrency(activePeriodProgress.paidCents)}</strong>
              </span>
              <span>
                Goal <strong>{formatCurrency(activePeriodProgress.targetCents)}</strong>
              </span>
            </div>
            <p>
              {activePeriodProgress.isDone
                ? "Goal met for this period."
                : `${formatCurrency(activePeriodProgress.remainingCents)} left to finish this period.`}
            </p>
            {form.budgetFrequency === "WEEKLY" && <small>Weeks run Sunday through Saturday.</small>}
          </section>

          <section className="payoff-rules-panel">
            <div className="payoff-panel-heading">
              <Shield size={18} />
              <div>
                <h2>Plan rules</h2>
                <p>Adjust without changing balances.</p>
              </div>
            </div>

            <form className="payoff-settings-form" onSubmit={submit}>
              <label className="field-block">
                Debt budget ({frequencyCopy.thisPeriod})
                <input
                  id="payoff-debt-budget"
                  inputMode="decimal"
                  placeholder={safeAvailableCash > 0 ? centsToInput(safeAvailableCash) : "0.00"}
                  value={form.monthlyBudget}
                  onChange={(event) => setForm({ ...form, monthlyBudget: event.target.value })}
                />
              </label>

              <label className="field-block">
                Frequency
                <select
                  value={form.budgetFrequency}
                  onChange={(event) => setForm({ ...form, budgetFrequency: event.target.value as PayoffBudgetFrequency })}
                >
                  {Object.entries(budgetFrequencyLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                Reserve
                <input
                  inputMode="decimal"
                  value={form.emergencyReserve}
                  onChange={(event) => setForm({ ...form, emergencyReserve: event.target.value })}
                />
              </label>

              <label className="field-block">
                Max accounts
                <input
                  inputMode="numeric"
                  min="1"
                  placeholder="No limit"
                  type="number"
                  value={form.maxAccountsPerRound}
                  onChange={(event) => setForm({ ...form, maxAccountsPerRound: event.target.value })}
                />
              </label>

              <p className="field-hint">
                Leave budget blank to use safe cash, or enter what you want to pay {frequencyCopy.thisPeriod}.
              </p>

              <label className="field-block">
                Strategy
                <select value={form.strategy} onChange={(event) => setForm({ ...form, strategy: event.target.value as PayoffStrategy })}>
                  {Object.entries(strategyLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {error && <div className="form-error">{error}</div>}
              {budgetWarning && (
                <div className="allocation-warning compact-warning">
                  <AlertTriangle size={16} />
                  <span>{budgetWarning}</span>
                </div>
              )}

              {hasManualEdits && (
                <button className="payoff-reset-button" type="button" onClick={resetManualAllocations}>
                  Reset manual allocations
                </button>
              )}

              <button className="primary-button payoff-save-button" disabled={isSaving || !hasUnsavedChanges} type="submit">
                <Save size={17} />
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Save plan" : "Saved"}
              </button>
            </form>
          </section>

          <div className="payoff-mini-cash">
            <div>
              <CalendarClock size={16} />
              <span>Available cash</span>
              <strong>{formatCurrency(availableCashCents)}</strong>
            </div>
            <div>
              <span>Safe to plan</span>
              <strong>{formatCurrency(safeAvailableCash)}</strong>
            </div>
            <div>
              <span>Possible savings</span>
              <strong>{formatCurrency(financialSummary.possibleSettlementSavingsCents)}</strong>
            </div>
          </div>

        </aside>

        <div className="payoff-workspace-main">
          <section className="panel payoff-recommendation-panel">
            <div className="payoff-toolbar">
              <div className="payoff-panel-heading">
                <Route size={18} />
                <div>
                  <h2>Recommended payments</h2>
                  <p>{recommendedCopy}</p>
                </div>
              </div>
              {planBudgetCents > 0 && (
                <span className={allocationOverBudget ? "count-pill danger-pill" : "count-pill"}>
                  {allocationOverBudget ? `${formatCurrency(allocatedNow - recommendationBudgetCents)} over` : `${formatCurrency(cashRemaining)} unassigned`}
                </span>
              )}
            </div>

            {allocationWarning && (
              <div className="allocation-warning compact-warning payoff-allocation-warning">
                <AlertTriangle size={16} />
                <span>{allocationWarning}</span>
              </div>
            )}

            {hasRecommendedPayments ? (
              <div className="payoff-payment-queue">
                {recommendationDebts.map((debt, index) => {
                  const level = getDebtPriorityLevel(debt.priorityScore);
                  const percentCovered = debt.targetRemainingCents > 0 ? Math.min(100, Math.round((debt.allocationCents / debt.targetRemainingCents) * 100)) : 0;
                  const hasManualAmount = hasManualAllocation(form.manualAllocations, debt.id);

                  return (
                    <article className="payoff-payment-row" key={debt.id}>
                      <span className="payoff-rank">{index + 1}</span>
                      <div className="payoff-row-title">
                        <strong>{debt.creditorName}</strong>
                        <span>
                          {level} - {debt.targetLabel} - {debt.explanation}
                          {debt.payForDelete || debt.payForDeleteFromNegotiation ? " - Pay-for-delete" : ""}
                        </span>
                      </div>
                      <div className="payoff-row-meter" aria-label={`${percentCovered}% covered`}>
                        <span style={{ width: `${percentCovered}%` }} />
                      </div>
                      <label className="payoff-allocation-field">
                        <span>Pay</span>
                        <input
                          aria-label={`Payment allocation for ${debt.creditorName}`}
                          inputMode="decimal"
                          value={form.manualAllocations[debt.id] ?? centsToInput(debt.allocationCents)}
                          onChange={(event) => setManualAllocation(debt.id, event.target.value)}
                        />
                        {hasManualAmount && (
                          <button type="button" onClick={() => clearManualAllocation(debt.id)}>
                            Auto
                          </button>
                        )}
                      </label>
                      <div className="payoff-row-money">
                        <span>Left</span>
                        <strong>{formatCurrency(debt.targetRemainingAfterAllocationCents)}</strong>
                      </div>
                      <button className="payoff-row-action" type="button" onClick={() => onOpenPayments(createPaymentDraft(debt, debt.allocationCents))}>
                        Record
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state payoff-empty-state">
                <strong>No payment queue yet.</strong>
                <span>Save a budget and frequency to turn the payoff order into payments you can record.</span>
                <div className="payoff-empty-actions">
                  <button className="payoff-row-action" type="button" onClick={focusBudgetField}>
                    Set budget
                  </button>
                  {safeAvailableCash > 0 && (
                    <button className="payoff-soft-action" type="button" onClick={useSafeCash}>
                      Use {formatCurrency(safeAvailableCash)}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="panel payoff-period-history-panel">
            <div className="payoff-toolbar">
              <div className="payoff-panel-heading">
                <CalendarClock size={18} />
                <div>
                  <h2>Period milestones</h2>
                  <p>Target vs paid by {frequencyCopy.singular.toLowerCase()}.</p>
                </div>
              </div>
              <span className={activePeriodProgress.isDone ? "count-pill success-pill" : "count-pill"}>
                {activePeriodProgress.isDone ? "Goal met" : `${activePeriodProgress.paidPercent}% now`}
              </span>
            </div>

            {periodHistoryRows.length ? (
              <div className="payoff-period-history-list">
                {periodHistoryRows.map((row) => (
                  <article className={`payoff-history-row ${row.status.toLowerCase()}`} key={row.key}>
                    <div className="payoff-history-head">
                      <div>
                        <strong>{row.range}</strong>
                        <span>{row.isCurrent ? "Current period" : row.completedAt ? `Completed ${formatShortDate(row.completedAt)}` : row.statusLabel}</span>
                      </div>
                      <em>{row.statusLabel}</em>
                    </div>
                    <div className="payoff-period-meter" aria-label={`${row.paidPercent}% paid for ${row.range}`}>
                      <span style={{ width: `${row.paidPercent}%` }} />
                    </div>
                    <div className="payoff-history-values">
                      <span>
                        Paid <strong>{formatCurrency(row.paidCents)}</strong>
                      </span>
                      <span>
                        Goal <strong>{formatCurrency(row.targetCents)}</strong>
                      </span>
                      <span>
                        Left <strong>{formatCurrency(row.remainingCents)}</strong>
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state payoff-empty-state">
                <strong>No milestone history yet.</strong>
                <span>Set a budget and record payments to build period history.</span>
              </div>
            )}
          </section>

          <section className="panel payoff-order-panel">
            <div className="payoff-toolbar">
              <div className="payoff-panel-heading">
                <Route size={18} />
                <div>
                  <h2>Payoff order</h2>
                  <p>
                    {visibleOrderDebts.length
                      ? `Next after this ${frequencyCopy.singular.toLowerCase()}.`
                      : "The current recommendation covers the active queue."}
                  </p>
                </div>
              </div>
              <span className="count-pill">{formatPeriodEstimate(plan.estimatedPeriods, form.budgetFrequency)}</span>
            </div>

            {visibleOrderDebts.length ? (
              <div className="payoff-order-list">
                {visibleOrderDebts.map((debt, index) => {
                  const level = getDebtPriorityLevel(debt.priorityScore);
                  const paidPercent =
                    debt.fullRemainingCents + debt.paidCents > 0
                      ? Math.min(100, Math.round((debt.paidCents / (debt.fullRemainingCents + debt.paidCents)) * 100))
                      : 0;
                  const planIndex = plan.planDebts.findIndex((item) => item.id === debt.id);

                  return (
                    <article className="payoff-order-row" key={debt.id}>
                      <span className="payoff-rank">{planIndex + 1 || index + 1}</span>
                      <div className="payoff-row-title">
                        <strong>{debt.creditorName}</strong>
                        <span>
                          {level} - {debt.explanation}
                          {debt.payForDelete || debt.payForDeleteFromNegotiation ? " - Pay-for-delete" : ""}
                        </span>
                      </div>
                      <div className="payoff-row-money">
                        <span>{debt.targetLabel}</span>
                        <strong>{formatCurrency(debt.targetRemainingCents)}</strong>
                      </div>
                      <div className="payoff-row-meter" aria-label={`${paidPercent}% paid`}>
                        <span style={{ width: `${paidPercent}%` }} />
                      </div>
                      <span className="payoff-row-state">{formatPeriodState(debt.cumulativePeriods, form.budgetFrequency)}</span>
                    </article>
                  );
                })}
                {hiddenOrderCount > 0 && (
                  <div className="payoff-order-more">
                    <span>
                      {hiddenOrderCount} more debt{hiddenOrderCount === 1 ? "" : "s"} remain after this view.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state payoff-empty-state">
                <strong>{plan.planDebts.length ? "Current queue is funded." : "No active debts in the plan yet."}</strong>
                <span>
                  {plan.planDebts.length
                    ? "Use the recommended payments above, then record payments to refresh this order."
                    : "Add debts first, then come back here to choose a payoff budget."}
                </span>
              </div>
            )}
          </section>
        </div>
      </section>

      <section className="payoff-next-actions">
        <button className="payoff-action-card" type="button" onClick={onOpenDebts}>
          <CheckCircle2 size={18} />
          <span>Review debts</span>
          <ArrowRight size={16} />
        </button>
        <button className="payoff-action-card" type="button" onClick={onOpenIncome}>
          <CheckCircle2 size={18} />
          <span>Add income</span>
          <ArrowRight size={16} />
        </button>
        <button className="payoff-action-card" type="button" onClick={() => onOpenPayments()}>
          <CheckCircle2 size={18} />
          <span>Record payments</span>
          <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}

type PeriodHistoryRow = {
  completedAt: string | null;
  isCurrent: boolean;
  key: string;
  paidCents: number;
  paidPercent: number;
  range: string;
  remainingCents: number;
  status: "ACTIVE" | "DONE" | "SHORT";
  statusLabel: string;
  targetCents: number;
};

function buildPeriodHistoryRows(
  milestones: PayoffMilestone[],
  activePeriodProgress: ReturnType<typeof buildPayoffPeriodProgress>,
  frequency: PayoffBudgetFrequency,
): PeriodHistoryRow[] {
  if (activePeriodProgress.targetCents <= 0) return [];

  const rows = new Map<string, PeriodHistoryRow>();
  const today = new Date().toISOString().slice(0, 10);

  for (const milestone of milestones) {
    if (milestone.budgetFrequency !== frequency || milestone.targetCents <= 0) continue;
    const key = getPeriodHistoryKey(milestone.periodStart, milestone.periodEnd);
    const status = milestone.status === "DONE" ? "DONE" : milestone.periodEnd < today ? "SHORT" : "ACTIVE";
    rows.set(key, {
      completedAt: milestone.completedAt,
      isCurrent: false,
      key,
      paidCents: milestone.paidCents,
      paidPercent: getPercent(milestone.paidCents, milestone.targetCents),
      range: formatPayoffPeriodRange(milestone.periodStart, milestone.periodEnd),
      remainingCents: Math.max(0, milestone.targetCents - milestone.paidCents),
      status,
      statusLabel: formatMilestoneStatus(status),
      targetCents: milestone.targetCents,
    });
  }

  const activeKey = getPeriodHistoryKey(activePeriodProgress.periodStart, activePeriodProgress.periodEnd);
  const activeStatus = activePeriodProgress.isDone ? "DONE" : "ACTIVE";
  rows.set(activeKey, {
    completedAt: null,
    isCurrent: true,
    key: activeKey,
    paidCents: activePeriodProgress.paidCents,
    paidPercent: activePeriodProgress.paidPercent,
    range: formatPayoffPeriodRange(activePeriodProgress.periodStart, activePeriodProgress.periodEnd),
    remainingCents: activePeriodProgress.remainingCents,
    status: activeStatus,
    statusLabel: formatMilestoneStatus(activeStatus),
    targetCents: activePeriodProgress.targetCents,
  });

  return [...rows.values()].sort((left, right) => right.key.localeCompare(left.key)).slice(0, 5);
}

function getPeriodHistoryKey(periodStart: string, periodEnd: string) {
  return `${periodStart}:${periodEnd}`;
}

function formatMilestoneStatus(status: PeriodHistoryRow["status"]) {
  if (status === "DONE") return "Met";
  if (status === "SHORT") return "Short";
  return "Active";
}

export function buildPayoffPlan(
  debts: Debt[],
  payments: Payment[],
  budgetCents: number,
  strategy: PayoffStrategy,
  maxAccountsPerRound: number | null,
  manualAllocations: Record<string, number>,
  negotiationInsights: Map<string, DebtNegotiationInsight>,
  estimateBudgetCents = budgetCents,
) {
  const paymentSummary = summarizePayments(payments);
  const normalizedBudgetCents = Math.max(0, budgetCents);
  const normalizedEstimateBudgetCents = Math.max(0, estimateBudgetCents);
  const sortedDebts = debts
    .map((debt) => {
      const insight = negotiationInsights.get(debt.id);
      const figures = getDebtFigures(debt, paymentSummary, insight);
      return {
        ...debt,
        allocationCents: 0,
        cumulativePeriods: null,
        explanation: getPlanExplanation(debt, strategy, figures.targetSource),
        fullRemainingAfterAllocationCents: figures.fullRemainingCents,
        fullRemainingCents: figures.fullRemainingCents,
        paidCents: figures.paidCents,
        payForDeleteFromNegotiation: Boolean(insight?.payForDeleteIncluded),
        targetDeadlineAt: insight?.agreementDueAt ?? insight?.offerExpiresAt ?? null,
        targetLabel: figures.targetLabel,
        targetRemainingAfterAllocationCents: figures.targetRemainingCents,
        targetRemainingCents: figures.targetRemainingCents,
        targetSource: figures.targetSource,
      };
    })
    .filter((debt) => debt.fullRemainingCents > 0 && debt.targetRemainingCents > 0)
    .sort((left, right) => comparePlanDebts(left, right, strategy));

  const manualAllocationMap = new Map<string, number>();
  for (const debt of sortedDebts) {
    if (Object.prototype.hasOwnProperty.call(manualAllocations, debt.id)) {
      manualAllocationMap.set(debt.id, Math.max(0, Math.min(debt.targetRemainingCents, manualAllocations[debt.id] ?? 0)));
    }
  }
  const manualAllocationTotal = [...manualAllocationMap.values()].reduce((sum, amount) => sum + amount, 0);

  let cumulativePeriods = 0;
  let availableCents = Math.max(0, normalizedBudgetCents - manualAllocationTotal);
  let allocatedAccounts = [...manualAllocationMap.values()].filter((amount) => amount > 0).length;
  const planDebts: PlanDebt[] = sortedDebts.map((debt) => {
    const periods = normalizedEstimateBudgetCents > 0 ? Math.ceil(debt.targetRemainingCents / normalizedEstimateBudgetCents) : 0;
    const manualAllocationCents = manualAllocationMap.get(debt.id);
    const canAllocate = manualAllocationCents !== undefined || maxAccountsPerRound === null || allocatedAccounts < maxAccountsPerRound;
    const allocationCents = manualAllocationCents ?? (canAllocate ? Math.max(0, Math.min(debt.targetRemainingCents, availableCents)) : 0);
    if (manualAllocationCents === undefined) availableCents -= allocationCents;
    if (manualAllocationCents === undefined && allocationCents > 0) allocatedAccounts += 1;
    cumulativePeriods += periods;

    return {
      ...debt,
      allocationCents,
      cumulativePeriods: normalizedEstimateBudgetCents > 0 ? cumulativePeriods : null,
      fullRemainingAfterAllocationCents: Math.max(0, debt.fullRemainingCents - allocationCents),
      targetRemainingAfterAllocationCents: Math.max(0, debt.targetRemainingCents - allocationCents),
    };
  });
  const allocatedCents = planDebts.reduce((sum, debt) => sum + debt.allocationCents, 0);
  const estimatedPeriods = normalizedEstimateBudgetCents > 0 ? cumulativePeriods : 0;

  return {
    allocatedCents,
    autoAllocationCents: Math.max(0, allocatedCents - manualAllocationTotal),
    estimatedMonths: estimatedPeriods,
    estimatedPeriods,
    isOverBudget: allocatedCents > normalizedBudgetCents,
    manualAllocationCents: manualAllocationTotal,
    planDebts,
    possibleSavingsCents: planDebts.reduce((sum, debt) => sum + getPlanSavingsCents(debt), 0),
    remainingBudgetCents: normalizedBudgetCents - allocatedCents,
    totalCurrentTarget: planDebts.reduce((sum, debt) => sum + debt.targetRemainingCents, 0),
    totalFullRemaining: planDebts.reduce((sum, debt) => sum + debt.fullRemainingCents, 0),
    totalPaid: planDebts.reduce((sum, debt) => sum + debt.paidCents, 0),
  };
}

export function getPayoffRecommendationBudgetCents({
  periodRemainingCents,
  safeAvailableCashCents,
}: {
  periodRemainingCents: number;
  safeAvailableCashCents: number;
}) {
  return Math.max(0, Math.min(periodRemainingCents, safeAvailableCashCents));
}

function getDebtFigures(debt: Debt, summary: PaymentSummary, insight?: DebtNegotiationInsight) {
  const paidCents = summary.paidByDebt.get(debt.id) ?? 0;
  const fullRemainingCents = getDebtRemainingCents(debt, summary);
  const obligation = getDebtPlanningTarget(debt, summary, insight);

  return {
    fullRemainingCents,
    paidCents,
    targetLabel: obligation.label,
    targetRemainingCents: obligation.cents,
    targetSource: obligation.source,
  };
}

function comparePlanDebts(left: PlanDebt, right: PlanDebt, strategy: PayoffStrategy) {
  const deadlineCompare = compareNegotiationDeadlines(left, right);
  if (deadlineCompare) return deadlineCompare;

  if (strategy === "SNOWBALL" || strategy === "LOW_BALANCE") return left.targetRemainingCents - right.targetRemainingCents || left.priority - right.priority;
  if (strategy === "AVALANCHE") {
    return (right.aprBasisPoints ?? 0) - (left.aprBasisPoints ?? 0) || right.fullRemainingCents - left.fullRemainingCents || left.priority - right.priority;
  }
  if (strategy === "HIGH_BALANCE") return right.fullRemainingCents - left.fullRemainingCents || left.priority - right.priority;
  if (strategy === "SETTLEMENT_FIRST" || strategy === "SETTLEMENT") {
    const leftTarget = left.settlementCents ?? left.targetRemainingCents ?? Number.MAX_SAFE_INTEGER;
    const rightTarget = right.settlementCents ?? right.targetRemainingCents ?? Number.MAX_SAFE_INTEGER;
    return getDebtSettlementSavingsCents(right) - getDebtSettlementSavingsCents(left) || leftTarget - rightTarget || left.priority - right.priority;
  }
  if (strategy === "CREDIT_REPAIR_FIRST") {
    return getCreditRepairRank(right) - getCreditRepairRank(left) || right.priorityScore - left.priorityScore || left.priority - right.priority;
  }
  if (strategy === "EMERGENCY_FIRST") {
    return getEmergencyRank(right) - getEmergencyRank(left) || right.priorityScore - left.priorityScore || left.priority - right.priority;
  }
  if (strategy === "HYBRID") {
    return getHybridRank(right) - getHybridRank(left) || right.priorityScore - left.priorityScore || left.priority - right.priority;
  }
  return left.priority - right.priority || right.priorityScore - left.priorityScore;
}

function compareNegotiationDeadlines(left: PlanDebt, right: PlanDebt) {
  const leftHasNegotiatedTarget = left.targetSource === "negotiation" || Boolean(left.targetDeadlineAt);
  const rightHasNegotiatedTarget = right.targetSource === "negotiation" || Boolean(right.targetDeadlineAt);
  if (!leftHasNegotiatedTarget && !rightHasNegotiatedTarget) return 0;
  if (leftHasNegotiatedTarget && !rightHasNegotiatedTarget) return -1;
  if (!leftHasNegotiatedTarget && rightHasNegotiatedTarget) return 1;

  const leftTime = getNegotiationDeadlineTime({
    acceptedAgreementCents: left.targetSource === "negotiation" ? left.targetRemainingCents + left.paidCents : null,
    agreementDueAt: left.targetDeadlineAt,
    offerExpiresAt: left.targetDeadlineAt,
    payForDeleteIncluded: left.payForDeleteFromNegotiation,
    sourceNegotiationId: null,
  });
  const rightTime = getNegotiationDeadlineTime({
    acceptedAgreementCents: right.targetSource === "negotiation" ? right.targetRemainingCents + right.paidCents : null,
    agreementDueAt: right.targetDeadlineAt,
    offerExpiresAt: right.targetDeadlineAt,
    payForDeleteIncluded: right.payForDeleteFromNegotiation,
    sourceNegotiationId: null,
  });

  return leftTime - rightTime;
}

function getEmergencyRank(debt: Debt) {
  const level = getDebtPriorityLevel(debt.priorityScore);
  if (level === "Emergency") return 500;
  if (debt.status === "PAST_DUE") return 420;
  if (debt.monthsBehind !== null && debt.monthsBehind >= 3) return 360;
  if (level === "Critical") return 320;
  return debt.priorityScore;
}

function getCreditRepairRank(debt: Debt) {
  return (debt.reported ? 100 : 0) + (debt.payForDelete ? 80 : 0) + (debt.status === "COLLECTION" ? 60 : 0) + debt.priorityScore;
}

function getHybridRank(debt: Debt) {
  return getEmergencyRank(debt) + Math.round(getCreditRepairRank(debt) / 2) + Math.round(getDebtSettlementSavingsCents(debt) / 10000);
}

function getPlanExplanation(debt: Debt, strategy: PayoffStrategy, targetSource: "debt" | "negotiation") {
  const level = getDebtPriorityLevel(debt.priorityScore);
  if (targetSource === "negotiation") return "Accepted agreement.";
  if (strategy === "SNOWBALL" || strategy === "LOW_BALANCE") return "Smallest target first.";
  if (strategy === "AVALANCHE") {
    return debt.aprBasisPoints ? `APR ${(debt.aprBasisPoints / 100).toFixed(2)}%.` : "Highest-cost account.";
  }
  if (strategy === "HIGH_BALANCE") return "Largest balance first.";
  if (strategy === "SETTLEMENT_FIRST" || strategy === "SETTLEMENT") {
    return debt.settlementCents ? `Save ${formatCurrency(getDebtSettlementSavingsCents(debt))} with settlement.` : "No settlement target recorded.";
  }
  if (strategy === "CREDIT_REPAIR_FIRST") {
    if (debt.reported && debt.payForDelete) return "Reported with pay-for-delete potential.";
    if (debt.reported) return "Reported on credit.";
    return "Lower reporting impact.";
  }
  if (strategy === "EMERGENCY_FIRST") return level === "Emergency" ? "Needs first attention." : `${level} after emergencies.`;
  if (strategy === "HYBRID") {
    if (level === "Emergency") return "Immediate risk first.";
    if (debt.reported && debt.payForDelete) return "Credit repair opportunity.";
    if (debt.settlementCents) return "Settlement savings available.";
  }
  return "Manual priority order.";
}

function getPlanSavingsCents(debt: PlanDebt) {
  if (debt.targetSource === "negotiation") return Math.max(0, debt.fullRemainingCents - debt.targetRemainingCents);
  return getDebtSettlementSavingsCents(debt);
}

function createPaymentDraft(debt: PlanDebt, allocationCents?: number): PaymentInput {
  const amountCents = allocationCents || debt.allocationCents || debt.targetRemainingCents;
  return {
    accountId: "",
    debtId: debt.id,
    paymentType: getPaymentTypeForTarget(debt),
    amount: centsToInput(amountCents),
    principal: "",
    interestAndFees: "",
    resultingBalance: "",
    confirmationNumber: "",
    paymentMethod: "",
    paidDate: toDateInput(new Date().toISOString()),
    updateDebtStatus: debt.targetLabel === "Settlement" || debt.targetLabel === "Payoff",
    notes: `Payoff plan recommendation for ${debt.targetLabel.toLowerCase()}.`,
  };
}

function getPaymentTypeForTarget(debt: PlanDebt): PaymentType {
  if (debt.targetLabel === "Settlement" || debt.targetLabel === "Agreement") return "SETTLEMENT";
  if (debt.targetLabel === "Minimum") return "MINIMUM";
  if (debt.targetLabel === "Past due") return "CATCH_UP";
  if (debt.targetLabel === "Payoff") return "PAYOFF";
  return "REGULAR";
}

function formatPeriodEstimate(periods: number, frequency: PayoffBudgetFrequency) {
  return periods ? `${periods} ${budgetFrequencyCopy[frequency].estimate} estimate` : "Budget needed";
}

function formatPeriodState(periods: number | null, frequency: PayoffBudgetFrequency) {
  return periods ? `${budgetFrequencyCopy[frequency].singular} ${periods}` : "Set budget";
}

function getPayoffBudgetWarning({
  availableCashCents,
  budgetCents,
  frequency,
  reserveCents,
  safeAvailableCash,
  validationMessage,
}: {
  availableCashCents: number;
  budgetCents: number;
  frequency: PayoffBudgetFrequency;
  reserveCents: number;
  safeAvailableCash: number;
  validationMessage: string;
}) {
  if (validationMessage) return validationMessage;
  if (availableCashCents < 0) return `Cash accounts are negative by ${formatCurrency(Math.abs(availableCashCents))} before this plan.`;
  if (reserveCents > availableCashCents && reserveCents > 0) {
    return `Reserve is ${formatCurrency(reserveCents - availableCashCents)} above available cash, so safe cash is $0.`;
  }
  if (budgetCents > safeAvailableCash) {
    return `Budget is ${formatCurrency(budgetCents - safeAvailableCash)} above safe cash for this ${budgetFrequencyCopy[frequency].singular.toLowerCase()}.`;
  }
  return "";
}

function getBudgetValidationMessage(form: PayoffSettingsInput) {
  if (parseMoneyInputLoose(form.monthlyBudget) === null) return "Enter a valid debt budget amount.";
  if (parseMoneyInputLoose(form.emergencyReserve) === null) return "Enter a valid reserve amount.";
  if (parseMaxAccountsInput(form.maxAccountsPerRound) === null && form.maxAccountsPerRound.trim()) {
    return "Max accounts must be a whole number greater than zero.";
  }

  for (const [debtId, value] of Object.entries(form.manualAllocations)) {
    if (parseMoneyInputLoose(value) === null) {
      return `Manual allocation for ${debtId} is not a valid amount.`;
    }
  }

  return "";
}

function payoffSettingsToForm(settings: PayoffSettings): PayoffSettingsInput {
  return {
    budgetFrequency: settings.budgetFrequency,
    emergencyReserve: centsToInput(settings.emergencyReserveCents),
    maxAccountsPerRound: settings.maxAccountsPerRound === null ? "" : String(settings.maxAccountsPerRound),
    manualAllocations: centsRecordToInput(settings.manualAllocations),
    monthlyBudget: centsToInput(settings.monthlyBudgetCents),
    strategy: settings.strategy,
  };
}

function serializePayoffForm(form: PayoffSettingsInput) {
  return JSON.stringify({
    budgetFrequency: form.budgetFrequency,
    emergencyReserve: form.emergencyReserve.trim(),
    maxAccountsPerRound: form.maxAccountsPerRound.trim(),
    manualAllocations: Object.fromEntries(Object.entries(form.manualAllocations).sort(([left], [right]) => left.localeCompare(right))),
    monthlyBudget: form.monthlyBudget.trim(),
    strategy: form.strategy,
  });
}

function hasManualAllocation(allocations: Record<string, string>, debtId: string) {
  return Object.prototype.hasOwnProperty.call(allocations, debtId);
}

function centsRecordToInput(allocations: Record<string, number>) {
  return Object.fromEntries(Object.entries(allocations).map(([debtId, cents]) => [debtId, centsToInput(cents)]));
}

function parseEditableManualAllocations(allocations: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(allocations)
      .map(([debtId, value]) => [debtId, parseMoneyInputLoose(value)] as const)
      .filter((entry): entry is [string, number] => entry[1] !== null),
  );
}

function parseMoneyInputLoose(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

function parseMaxAccountsInput(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function centsToInput(cents: number) {
  return cents ? (cents / 100).toFixed(2) : "";
}

function getPercent(valueCents: number, targetCents: number) {
  return targetCents > 0 ? Math.min(100, Math.round((valueCents / targetCents) * 100)) : 0;
}

function toDateInput(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}
