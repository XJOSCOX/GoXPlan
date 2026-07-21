import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CreditCard, Edit3, Plus, ReceiptText, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { buildNegotiationInsights, getPlanningTarget, type DebtNegotiationInsight } from "../../lib/negotiationTargets";
import type { Debt, FinancialAccount, Negotiation, Payment, PaymentInput, PaymentType } from "../../types";

type PaymentsPageProps = {
  debts: Debt[];
  financialAccounts: FinancialAccount[];
  initialPayment?: PaymentInput;
  negotiations: Negotiation[];
  payments: Payment[];
  onSave: (input: PaymentInput) => Promise<void>;
  onDelete: (paymentId: string) => Promise<void>;
  onInitialPaymentUsed?: () => void;
};

type PaymentSummary = ReturnType<typeof summarizePayments>;

const emptyForm: PaymentInput = {
  accountId: "",
  debtId: "",
  paymentType: "REGULAR",
  amount: "",
  principal: "",
  interestAndFees: "",
  resultingBalance: "",
  confirmationNumber: "",
  paymentMethod: "",
  paidDate: toDateInput(new Date().toISOString()),
  updateDebtStatus: false,
  notes: "",
};

const paymentTypeLabels: Record<PaymentType, string> = {
  REGULAR: "Regular",
  MINIMUM: "Minimum",
  CATCH_UP: "Catch-up",
  EXTRA: "Extra",
  SETTLEMENT: "Settlement",
  PAYOFF: "Payoff",
};

export function PaymentsPage({ debts, financialAccounts, initialPayment, negotiations, payments, onSave, onDelete, onInitialPaymentUsed }: PaymentsPageProps) {
  const paymentAccounts = useMemo(() => financialAccounts.filter((account) => account.accountType !== "TRADING"), [financialAccounts]);
  const [form, setForm] = useState<PaymentInput>(() => ({ ...emptyForm, accountId: paymentAccounts[0]?.id ?? "", debtId: debts[0]?.id ?? "" }));
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);

  useEffect(() => {
    if (!initialPayment) return;
    setError("");
    setForm({ ...initialPayment, accountId: initialPayment.accountId || paymentAccounts[0]?.id || "" });
    setIsFormOpen(true);
    onInitialPaymentUsed?.();
  }, [initialPayment, onInitialPaymentUsed, paymentAccounts]);

  const totals = useMemo(() => {
    const total = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const principal = payments.reduce((sum, payment) => sum + (payment.principalCents ?? payment.amountCents), 0);
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthTotal = payments
      .filter((payment) => getMonthKey(new Date(payment.paidAt)) === currentMonthKey)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const linkedDebtIds = new Set(payments.map((payment) => payment.debtId).filter(Boolean));
    return {
      linkedDebts: linkedDebtIds.size,
      monthTotal,
      principal,
      total,
    };
  }, [payments]);

  const selectedDebt = debts.find((debt) => debt.id === form.debtId);
  const selectedAccount = paymentAccounts.find((account) => account.id === form.accountId);
  const negotiationInsights = useMemo(() => buildNegotiationInsights(negotiations), [negotiations]);
  const previewSummary = useMemo(() => summarizePayments(payments, form.id), [form.id, payments]);
  const selectedInsight = selectedDebt ? negotiationInsights.get(selectedDebt.id) : undefined;
  const preview = selectedDebt ? getPaymentPreview(selectedDebt, form, previewSummary, selectedInsight) : undefined;
  const canUpdateDebtStatus = Boolean(
    selectedDebt && selectedDebt.status !== "SETTLED" && preview && (form.paymentType === "SETTLEMENT" || form.paymentType === "PAYOFF"),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.id) {
      setIsEditConfirmOpen(true);
      return;
    }

    await savePaymentForm();
  }

  async function savePaymentForm() {
    setError("");
    setIsSaving(true);

    try {
      await onSave(form);
      setIsEditConfirmOpen(false);
      closeForm();
    } catch (caught) {
      setIsEditConfirmOpen(false);
      setError(caught instanceof Error ? caught.message : "Could not save payment.");
    } finally {
      setIsSaving(false);
    }
  }

  function openAddForm() {
    setError("");
    setForm({ ...emptyForm, accountId: paymentAccounts[0]?.id ?? "", debtId: debts[0]?.id ?? "" });
    setIsFormOpen(true);
  }

  function editPayment(payment: Payment) {
    setError("");
    setForm({
      id: payment.id,
      accountId: payment.accountId ?? "",
      debtId: payment.debtId ?? "",
      paymentType: payment.paymentType,
      amount: centsToInput(payment.amountCents),
      principal: payment.principalCents === null ? "" : centsToInput(payment.principalCents),
      interestAndFees: payment.interestAndFeesCents === null ? "" : centsToInput(payment.interestAndFeesCents),
      resultingBalance: payment.resultingBalanceCents === null ? "" : centsToInput(payment.resultingBalanceCents),
      confirmationNumber: payment.confirmationNumber,
      paymentMethod: payment.paymentMethod,
      paidDate: toDateInput(payment.paidAt),
      updateDebtStatus: false,
      notes: payment.notes,
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setError("");
    setIsEditConfirmOpen(false);
    setForm({ ...emptyForm, accountId: paymentAccounts[0]?.id ?? "", debtId: debts[0]?.id ?? "" });
    setIsFormOpen(false);
  }

  function setDebt(debtId: string) {
    const debt = debts.find((item) => item.id === debtId);
    const nextSummary = summarizePayments(payments, form.id);
    const suggestedAmount = debt && !form.amount.trim() ? centsToInput(getDebtObligation(debt, nextSummary, negotiationInsights.get(debt.id)).cents) : form.amount;
    setForm({ ...form, debtId, amount: suggestedAmount });
  }

  function setPaymentType(paymentType: PaymentType) {
    const suggestedAmount = selectedDebt && !form.amount.trim() ? getSuggestedPaymentAmount(selectedDebt, paymentType, previewSummary, selectedInsight) : null;
    setForm({
      ...form,
      amount: suggestedAmount === null ? form.amount : centsToInput(suggestedAmount),
      paymentType,
      updateDebtStatus: paymentType === "SETTLEMENT" || paymentType === "PAYOFF",
    });
  }

  function useAmount(amountCents: number) {
    setForm({ ...form, amount: centsToInput(amountCents), principal: "", resultingBalance: "" });
  }

  async function confirmDeletePayment() {
    if (!paymentToDelete) return;
    setIsDeleting(true);
    setError("");

    try {
      await onDelete(paymentToDelete.id);
      setPaymentToDelete(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete payment.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="page-stack payments-page">
      <section className="summary-strip payment-summary-strip">
        <article>
          <span>Total paid</span>
          <strong>{formatCurrency(totals.total)}</strong>
        </article>
        <article>
          <span>Principal applied</span>
          <strong>{formatCurrency(totals.principal)}</strong>
        </article>
        <article>
          <span>This month</span>
          <strong>{formatCurrency(totals.monthTotal)}</strong>
        </article>
        <article>
          <span>Debts touched</span>
          <strong>{totals.linkedDebts}</strong>
        </article>
      </section>

      <section className="panel payments-panel">
        <div className="payments-toolbar">
          <div>
            <h2>Payment ledger</h2>
            <p>{payments.length ? "Every recorded payment, sorted by date." : "Record your first debt payment."}</p>
          </div>
          <button className="primary-button compact payment-add-button" disabled={!debts.length} type="button" onClick={openAddForm}>
            <Plus size={17} />
            Add payment
          </button>
        </div>

        {error && !isFormOpen && <div className="form-error">{error}</div>}

        {payments.length ? (
          <div className="payment-ledger">
            <div className="payment-ledger-head" aria-hidden="true">
              <span>Debt</span>
              <span>Payment</span>
              <span>Date</span>
              <span>Method</span>
              <span>After</span>
              <span>Actions</span>
            </div>

            <div className="payment-lines">
              {payments.map((payment) => (
                <article className="payment-line" key={payment.id}>
                  <div className="payment-main">
                    <ReceiptText size={17} />
                    <div>
                      <div className="payment-title-row">
                        <strong>{payment.debtName ?? "Removed debt"}</strong>
                        <span className={`payment-type-pill payment-type-${payment.paymentType.toLowerCase()}`}>
                          {paymentTypeLabels[payment.paymentType]}
                        </span>
                        {payment.notes && (
                          <span
                            aria-label={`Notes for payment to ${payment.debtName ?? "debt"}`}
                            className="note-tooltip payment-note-tooltip"
                            data-tooltip={payment.notes}
                            tabIndex={0}
                            title={payment.notes}
                          >
                            !
                          </span>
                        )}
                      </div>
                      <div className="payment-meta-strip">
                        {getPaymentMetaChips(payment).map((chip) => (
                          <span key={chip}>{chip}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="payment-money">
                    <span>Total paid</span>
                    <strong>{formatCurrency(payment.amountCents)}</strong>
                    {payment.interestAndFeesCents !== null && payment.interestAndFeesCents > 0 && (
                      <em>{formatCurrency(payment.principalCents ?? 0)} principal</em>
                    )}
                  </div>

                  <div className="payment-date">
                    <CalendarDays size={15} />
                    <span>{formatDate(payment.paidAt)}</span>
                  </div>

                  <div className="payment-detail">
                    <span>Fees</span>
                    <strong>
                      {payment.interestAndFeesCents === null || payment.interestAndFeesCents <= 0
                        ? "-"
                        : formatCurrency(payment.interestAndFeesCents)}
                    </strong>
                  </div>

                  <div className="payment-detail">
                    <span>Remaining</span>
                    <strong>{payment.resultingBalanceCents === null ? "Auto" : formatCurrency(payment.resultingBalanceCents)}</strong>
                  </div>

                  <div className="table-actions">
                    <button className="icon-button" type="button" onClick={() => editPayment(payment)} aria-label={`Edit payment for ${payment.debtName ?? "debt"}`}>
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="icon-button bad-entry"
                      type="button"
                      onClick={() => setPaymentToDelete(payment)}
                      aria-label={`Delete payment for ${payment.debtName ?? "debt"}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state payments-empty-state">
            <strong>{debts.length ? "No payments recorded yet." : "Add a debt before recording payments."}</strong>
            <span>Payments will update the dashboard progress graph and lower each debt's current obligation.</span>
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel payment-modal-panel" role="dialog" aria-modal="true" aria-labelledby="payment-form-title">
            <header className="modal-header">
              <div>
                <p>Payment details</p>
                <h2 id="payment-form-title">{form.id ? "Edit payment" : "Add payment"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeForm} aria-label="Close payment form">
                <X size={17} />
              </button>
            </header>

            <form className="payment-form" onSubmit={submit}>
              <div className="payment-form-grid">
                <section className="payment-form-main">
                  <label className="field-block">
                    Debt
                    <select value={form.debtId} onChange={(event) => setDebt(event.target.value)}>
                      <option value="">Choose a debt</option>
                      {debts.map((debt) => (
                        <option key={debt.id} value={debt.id}>
                          {debt.creditorName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="form-grid two">
                    <label className="field-block">
                      Paid from
                      <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
                        <option value="">No account selected</option>
                        {paymentAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {getAccountOptionLabel(account)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-block">
                      Payment type
                      <select value={form.paymentType} onChange={(event) => setPaymentType(event.target.value as PaymentType)}>
                        {Object.entries(paymentTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-block">
                      Paid date
                      <input type="date" value={form.paidDate} onChange={(event) => setForm({ ...form, paidDate: event.target.value })} />
                    </label>
                    <label className="field-block">
                      Amount
                      <input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
                    </label>
                    <label className="field-block">
                      Interest and fees
                      <input
                        inputMode="decimal"
                        value={form.interestAndFees}
                        onChange={(event) => setForm({ ...form, interestAndFees: event.target.value })}
                      />
                    </label>
                    <label className="field-block">
                      Principal
                      <input inputMode="decimal" value={form.principal} onChange={(event) => setForm({ ...form, principal: event.target.value })} />
                    </label>
                    <label className="field-block">
                      Resulting balance
                      <input
                        inputMode="decimal"
                        value={form.resultingBalance}
                        onChange={(event) => setForm({ ...form, resultingBalance: event.target.value })}
                      />
                    </label>
                    <label className="field-block">
                      Payment method
                      <input value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} />
                    </label>
                    <label className="field-block">
                      Confirmation number
                      <input value={form.confirmationNumber} onChange={(event) => setForm({ ...form, confirmationNumber: event.target.value })} />
                    </label>
                  </div>

                  {canUpdateDebtStatus && (
                    <label className="payment-status-toggle">
                      <input
                        checked={form.updateDebtStatus}
                        type="checkbox"
                        onChange={(event) => setForm({ ...form, updateDebtStatus: event.target.checked })}
                      />
                      <span>
                        Mark this debt as settled after saving
                        <em>Use this for confirmed settlements or full payoff payments.</em>
                      </span>
                    </label>
                  )}

                  <label className="field-block">
                    Notes
                    <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                  </label>
                </section>

                <aside className="payment-preview-card">
                  {selectedDebt && preview ? (
                    <>
                      <div className="payment-preview-heading">
                        <CreditCard size={17} />
                        <div>
                          <span>Selected debt</span>
                          <strong>{selectedDebt.creditorName}</strong>
                        </div>
                      </div>

                      <div className="payment-preview-actions">
                        <button type="button" onClick={() => useAmount(preview.beforeObligationCents)} disabled={preview.beforeObligationCents <= 0}>
                          Use current due
                        </button>
                        <button type="button" onClick={() => useAmount(preview.beforeRemainingCents)} disabled={preview.beforeRemainingCents <= 0}>
                          Use full balance
                        </button>
                      </div>

                      <div className="payment-preview-flow">
                        <div>
                          <span>Before</span>
                          <strong>{formatCurrency(preview.beforeObligationCents)}</strong>
                          <em>{preview.obligationLabel}</em>
                        </div>
                        <ArrowRight size={17} />
                        <div>
                          <span>After</span>
                          <strong>{formatCurrency(preview.afterObligationCents)}</strong>
                          <em>{formatCurrency(preview.principalCents)} applied</em>
                        </div>
                      </div>

                      <div className="payment-preview-list">
                        <div>
                          <span>Cash before</span>
                          <strong>{selectedAccount ? formatCurrency(selectedAccount.availableBalanceCents) : "No account"}</strong>
                        </div>
                        <div>
                          <span>Cash after</span>
                          <strong>
                            {selectedAccount ? formatCurrency(selectedAccount.availableBalanceCents - preview.paymentAmountCents) : "No account"}
                          </strong>
                        </div>
                        <div>
                          <span>Full balance now</span>
                          <strong>{formatCurrency(preview.beforeRemainingCents)}</strong>
                        </div>
                        <div>
                          <span>Full balance after</span>
                          <strong>{formatCurrency(preview.afterRemainingCents)}</strong>
                        </div>
                        <div>
                          <span>Fees recorded</span>
                          <strong>{formatCurrency(preview.interestAndFeesCents)}</strong>
                        </div>
                      </div>

                      {preview.afterObligationCents === 0 && preview.paymentAmountCents > 0 && (
                        <div className="payment-preview-success">
                          <CheckCircle2 size={17} />
                          This payment clears the current obligation.
                        </div>
                      )}

                      {canUpdateDebtStatus && form.updateDebtStatus && (
                        <div className="payment-preview-success">
                          <CheckCircle2 size={17} />
                          Debt status will change to settled.
                        </div>
                      )}

                      {canUpdateDebtStatus && !form.updateDebtStatus && (
                        <div className="payment-preview-warning">
                          <AlertTriangle size={17} />
                          Payment saves without changing the debt status.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="payment-preview-empty">
                      <ReceiptText size={18} />
                      <strong>Choose a debt</strong>
                      <span>The preview will show how the payment changes your plan.</span>
                    </div>
                  )}
                </aside>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="form-actions">
                <button className="icon-text-button" type="button" onClick={closeForm}>
                  Cancel
                </button>
                <button className="primary-button payment-add-button" disabled={isSaving} type="submit">
                  <Save size={17} />
                  {isSaving ? "Saving..." : form.id ? "Save changes" : "Add payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isEditConfirmOpen && (
        <ConfirmDialog
          confirmLabel="Save changes"
          isBusy={isSaving}
          message="This can change payoff progress and debt status calculations tied to this payment."
          title="Save payment changes?"
          tone="neutral"
          onCancel={() => setIsEditConfirmOpen(false)}
          onConfirm={() => void savePaymentForm()}
        />
      )}

      {paymentToDelete && (
        <ConfirmDialog
          confirmLabel="Delete payment"
          isBusy={isDeleting}
          message={`Delete the ${formatCurrency(paymentToDelete.amountCents)} payment for ${paymentToDelete.debtName ?? "this debt"}? The debt balance/status snapshot tied to this payment will be restored before it is removed.`}
          title="Delete payment?"
          tone="danger"
          onCancel={() => setPaymentToDelete(null)}
          onConfirm={() => void confirmDeletePayment()}
        />
      )}
    </div>
  );
}

function summarizePayments(payments: Payment[], ignoredPaymentId?: string) {
  const paidByDebt = new Map<string, number>();
  const resultingBalanceByDebt = new Map<string, { paidAt: string; amount: number }>();

  for (const payment of payments) {
    if (payment.id === ignoredPaymentId || !payment.debtId) continue;
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

function getPaymentPreview(debt: Debt, input: PaymentInput, summary: PaymentSummary, insight?: DebtNegotiationInsight) {
  const beforeRemainingCents = getRemainingCents(debt, summary);
  const beforeObligation = getDebtObligation(debt, summary, insight);
  const paymentAmountCents = parseMoneyInput(input.amount);
  const interestAndFeesCents = parseMoneyInput(input.interestAndFees);
  const principalCents = input.principal.trim() ? parseMoneyInput(input.principal) : Math.max(0, paymentAmountCents - interestAndFeesCents);
  const manualResultingBalance = input.resultingBalance.trim()
    ? parseMoneyInput(input.resultingBalance)
    : input.updateDebtStatus && (input.paymentType === "SETTLEMENT" || input.paymentType === "PAYOFF")
      ? 0
      : null;
  const afterRemainingCents = Math.max(0, manualResultingBalance ?? beforeRemainingCents - principalCents);
  const afterPaidByDebt = new Map(summary.paidByDebt);
  afterPaidByDebt.set(debt.id, (afterPaidByDebt.get(debt.id) ?? 0) + principalCents);
  const afterSummary = {
    paidByDebt: afterPaidByDebt,
    resultingBalanceByDebt: new Map(summary.resultingBalanceByDebt),
  };
  afterSummary.resultingBalanceByDebt.set(debt.id, { amount: afterRemainingCents, paidAt: input.paidDate });
  const afterObligationCents = getDebtObligation(debt, afterSummary, insight).cents;

  return {
    afterObligationCents,
    afterRemainingCents,
    beforeObligationCents: beforeObligation.cents,
    beforeRemainingCents,
    interestAndFeesCents,
    obligationLabel: beforeObligation.label,
    paymentAmountCents,
    principalCents,
  };
}

function getSuggestedPaymentAmount(debt: Debt, paymentType: PaymentType, summary: PaymentSummary, insight?: DebtNegotiationInsight) {
  if (paymentType === "PAYOFF") return getRemainingCents(debt, summary);
  if (paymentType === "SETTLEMENT" && insight?.acceptedAgreementCents !== null && insight?.acceptedAgreementCents !== undefined) {
    const paid = summary.paidByDebt.get(debt.id) ?? 0;
    return Math.max(0, Math.min(getRemainingCents(debt, summary), insight.acceptedAgreementCents - paid));
  }
  if (paymentType === "SETTLEMENT" && debt.settlementCents !== null) {
    const paid = summary.paidByDebt.get(debt.id) ?? 0;
    return Math.max(0, Math.min(getRemainingCents(debt, summary), debt.settlementCents - paid));
  }
  return getDebtObligation(debt, summary, insight).cents;
}

function getPaymentMetaChips(payment: Payment) {
  const chips: string[] = [];
  if (payment.accountName) chips.push(`Paid from ${payment.accountName}`);
  if (payment.paymentMethod) chips.push(payment.paymentMethod);
  if (payment.confirmationNumber) chips.push(`Confirmation ${payment.confirmationNumber}`);
  if (payment.principalCents !== null) chips.push(`${formatCurrency(payment.principalCents)} principal`);
  return chips.length ? chips : ["No method saved"];
}

function getAccountOptionLabel(account: FinancialAccount) {
  const type = account.accountType === "BANK" ? "Bank" : "Cash";
  return `${account.name} - ${type} - ${formatCurrency(account.availableBalanceCents)}`;
}

function getRemainingCents(debt: Debt, summary: PaymentSummary) {
  return summary.resultingBalanceByDebt.get(debt.id)?.amount ?? Math.max(0, debt.balanceCents - (summary.paidByDebt.get(debt.id) ?? 0));
}

function getDebtObligation(debt: Debt, summary: PaymentSummary, insight?: DebtNegotiationInsight) {
  const remainingCents = getRemainingCents(debt, summary);
  const paidCents = summary.paidByDebt.get(debt.id) ?? 0;
  return getPlanningTarget(debt, paidCents, remainingCents, insight);
}

function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function toDateInput(value: string) {
  return value ? value.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function getMonthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}
